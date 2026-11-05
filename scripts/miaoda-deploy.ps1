# SSPS one-command deploy to Feishu Miaoda (official single-repo flow).
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode check -Repo C:\Users\dongjin\ssps-miaoda
#   powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode sync -Repo <dir> [-DryRun]
#   powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode backup -Repo <dir> [-DryRun]
#   powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode gates -Repo <dir>
#   powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode push -Repo <dir>
#   powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode release -Repo <dir> -Reason "release note"
#
# sync   = GitHub working copy <repo>\..\app  ->  Miaoda working copy (one way).
# backup = Miaoda working copy  ->  GitHub working copy app\ (mirror, one way).
# Defaults: Repo = $env:MIAODA_REPO_DIR; Source = <script dir>\..\app;
# AppId = $env:MIAODA_APP_ID or .spark/meta.json; Branch = sprint/default.
# Never prints secrets, never force-pushes, never commits on sync/backup.
# Release needs -Reason and Leyinet approval each time (task book W51).

[CmdletBinding()]
param(
    [ValidateSet('check', 'sync', 'backup', 'gates', 'push', 'release')]
    [string]$Mode = 'check',
    [string]$Repo = $env:MIAODA_REPO_DIR,
    [string]$Source = '',
    [string]$AppId = $env:MIAODA_APP_ID,
    [string]$Branch = 'sprint/default',
    [string]$Reason = '',
    [string]$Message = '',
    [switch]$SkipChecks,
    [switch]$DryRun,
    [switch]$ForceProtected
)

$ErrorActionPreference = 'Stop'

function Say([string]$Msg) { Write-Host "[ssps] $Msg" }
function Die([string]$Msg) { Write-Host "[ssps] FAILED: $Msg"; exit 1 }
function Tail([string]$Text, [int]$Lines = 12) {
    ($Text -split "`r?`n" | Select-Object -Last $Lines) -join "`n"
}

function Resolve-Exe([string]$Name) {
    $c = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $c) { return $null }
    return $c.Source
}

function Resolve-Git {
    $c = Get-Command 'git.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $roots = @("$env:ProgramFiles\Git\cmd", "${env:ProgramFiles(x86)}\Git\cmd", "$env:LOCALAPPDATA\Programs\Git\cmd")
    foreach ($r in $roots) {
        $p = Join-Path $r 'git.exe'
        if (Test-Path $p) { return $p }
    }
    $pg = Join-Path $env:USERPROFILE '.workbuddy\binaries\PortableGit\versions'
    if (Test-Path $pg) {
        $hit = Get-ChildItem -Path $pg -Filter 'git.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

function Invoke-Tool {
    param([string]$Exe, [string[]]$Argv, [string]$WorkDir)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $WorkDir
    try {
        $out = & $Exe @Argv 2>&1 | Out-String
        $code = $LASTEXITCODE
    }
    finally {
        Pop-Location
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{ Code = $code; Out = $out }
}

function Invoke-Git([string[]]$Argv) {
    return Invoke-Tool -Exe $script:GitExe -Argv $Argv -WorkDir $script:RepoPath
}

function Cli([string[]]$Argv) {
    return Invoke-Tool -Exe $script:CliExe -Argv $Argv -WorkDir $script:RepoPath
}

function Is-AuthError([string]$Text) {
    return ($Text -match '401|403|Authentication failed|credential|token expired|could not read Username|Permission denied')
}

# Files owned by the Miaoda platform (app sync / +init / gen:db-schema rewrite them).
# sync never overwrites these from the GitHub working copy.
$script:SyncProtect = @(
    '.spark/', '.spark_project', '.gitignore', '.npmrc', 'AGENTS.md', 'skills/',
    'package.json', 'package-lock.json',
    'client/src/index.tsx', 'server/main.ts', 'server/database/schema.ts',
    'scripts/dev.sh', 'scripts/dev.js', 'scripts/dev-local.js', 'vite.config.ts'
)

function Get-FileMap([string]$Root) {
    $map = @{}
    $full = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    foreach ($f in (Get-ChildItem -Path $full -File -Recurse -Force -ErrorAction SilentlyContinue)) {
        $rel = $f.FullName.Substring($full.Length + 1) -replace '\\', '/'
        if ($rel -match '(^|/)(node_modules|\.git|dist|build|coverage|\.cache)/') { continue }
        if ($rel -match '(^|/)\.env(\.|$)') { continue }
        if ($rel -match '\.tsbuildinfo$') { continue }
        $map[$rel] = $f.FullName
    }
    return $map
}

function Get-Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        try { return [System.BitConverter]::ToString($sha.ComputeHash($fs)).Replace('-', '') }
        finally { $fs.Dispose() }
    }
    finally { $sha.Dispose() }
}

function Test-Protected([string]$Rel, [string[]]$Rules) {
    foreach ($r in $Rules) {
        if ($r.EndsWith('/')) {
            if ($Rel.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
        }
        elseif ($Rel -ieq $r) { return $true }
    }
    return $false
}

function Merge-PackageJson([string]$Src, [string]$Dst, [switch]$NoWrite) {
    if (-not (Test-Path $Src) -or -not (Test-Path $Dst)) { return }
    $a = Get-Content $Src -Raw | ConvertFrom-Json
    $b = Get-Content $Dst -Raw | ConvertFrom-Json
    $adds = @()
    foreach ($sec in @('scripts', 'dependencies', 'devDependencies')) {
        $sa = $a.$sec
        if ($null -eq $sa) { continue }
        if ($null -eq $b.$sec) {
            Add-Member -InputObject $b -MemberType NoteProperty -Name $sec -Value ([pscustomobject]@{}) -Force
        }
        $sb = $b.$sec
        foreach ($prop in $sa.PSObject.Properties) {
            if ($null -eq $sb.PSObject.Properties[$prop.Name]) {
                Add-Member -InputObject $sb -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
                $adds += "$sec/$($prop.Name)"
            }
        }
    }
    if ($adds.Count -eq 0) { Say 'package.json: no missing scripts or deps'; return }
    Say "package.json merge: $($adds -join ', ')"
    if (-not $NoWrite) {
        $json = ($b | ConvertTo-Json -Depth 100)
        [System.IO.File]::WriteAllText($Dst, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
    }
}

function Invoke-TreeSync {
    param([string]$From, [string]$To, [string[]]$Protect, [switch]$MergePackage, [switch]$NoWrite)
    if (-not (Test-Path $From -PathType Container)) { Die "source dir not found: $From" }
    if (-not (Test-Path $To -PathType Container)) { Die "target dir not found: $To" }
    $src = Get-FileMap $From
    $changed = 0
    $same = 0
    $skipped = @()
    foreach ($rel in ($src.Keys | Sort-Object)) {
        if (Test-Protected $rel $Protect) {
            if ($MergePackage -and $rel -eq 'package.json') {
                Merge-PackageJson (Join-Path $From 'package.json') (Join-Path $To 'package.json') -NoWrite:$NoWrite
            }
            else { $skipped += $rel }
            continue
        }
        $srcFile = $src[$rel]
        $dstFile = Join-Path $To ($rel -replace '/', '\')
        if ((Get-Sha $srcFile) -eq (Get-Sha $dstFile)) { $same++; continue }
        if (-not $NoWrite) {
            $dir = Split-Path -Parent $dstFile
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Copy-Item -LiteralPath $srcFile -Destination $dstFile -Force
        }
        $changed++
        if ($changed -le 40) { Say "copy: $rel" }
    }
    if ($changed -gt 40) { Say "copy: ... and $($changed - 40) more" }
    Say "changed=$changed unchanged=$same protected=$($skipped.Count)"
    if ($skipped.Count -gt 0 -and $skipped.Count -le 20) {
        Say "protected (platform-owned, not overwritten): $($skipped -join ', ')"
    }
    return $changed
}

function Show-Pending([string]$WorkDir) {
    $st = Invoke-Git @('status', '--porcelain')
    $lines = @($st.Out -split "`r?`n" | Where-Object { $_.Trim() })
    if ($lines.Count -eq 0) { Say 'git status: clean, nothing to commit'; return }
    Say "git status: $($lines.Count) pending change(s)"
    $lines | Select-Object -First 20 | ForEach-Object { Say "  $_" }
    if ($lines.Count -gt 20) { Say "  ... and $($lines.Count - 20) more" }
}

function Assert-EnvSafe {
    $st = Invoke-Git @('status', '--porcelain')
    $ls = Invoke-Git @('ls-files')
    $tracked = @{}
    foreach ($t in ($ls.Out -split "`r?`n")) {
        $v = $t.Trim()
        if ($v) { $tracked[$v] = $true }
    }
    foreach ($line in ($st.Out -split "`r?`n")) {
        if ($line.Length -lt 4) { continue }
        $p = $line.Substring(3).Trim()
        if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1] }
        if ($p -notmatch '(^|/)\.env' -or $p -match '\.env\.example') { continue }
        if (-not $tracked.ContainsKey($p)) {
            Die "a new env file would be committed: $p -- add it to .gitignore first"
        }
        $full = Join-Path $script:RepoPath $p
        if (Test-Path $full) {
            $hits = @()
            foreach ($l in (Get-Content $full)) {
                if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
                    $k = $Matches[1]
                    if ($k -match 'SECRET|TOKEN|PASSWORD|API_KEY') { $hits += $k }
                }
            }
            if ($hits.Count -gt 0) {
                Die "tracked env file $p has secret-like key names: $($hits -join ', ') -- move values to .env.local"
            }
            Say "tracked env template changed: $p (key names checked, no secrets)"
        }
    }
}

function Invoke-QualityGates {
    if ($SkipChecks) { Say 'quality gates skipped by -SkipChecks'; return }
    $gates = @(
        @{ Exe = 'npm'; Argv = @('test') },
        @{ Exe = 'npm'; Argv = @('run', 'type:check:server') },
        @{ Exe = 'npx'; Argv = @('tsc', '--noEmit', '--project', 'tsconfig.app.json') },
        @{ Exe = 'npx'; Argv = @('eslint', 'server', '--quiet') },
        @{ Exe = 'npx'; Argv = @('eslint', 'client/src', '--quiet') },
        @{ Exe = 'npx'; Argv = @('nest', 'build'); Env = 'NODE_ENV' },
        @{ Exe = 'node'; Argv = @('scripts/smoke.cjs') }
    )
    foreach ($g in $gates) {
        $exe = Resolve-Exe $g.Exe
        if (-not $exe) { Die "$($g.Exe) not found in PATH" }
        $saved = $null
        if ($g.Env) {
            $saved = [Environment]::GetEnvironmentVariable($g.Env, 'Process')
            [Environment]::SetEnvironmentVariable($g.Env, 'production', 'Process')
        }
        try {
            $r = Invoke-Tool -Exe $exe -Argv $g.Argv -WorkDir $script:RepoPath
        }
        finally {
            if ($g.Env) { [Environment]::SetEnvironmentVariable($g.Env, $saved, 'Process') }
        }
        if ($r.Code -ne 0) {
            Die "quality gate failed: $($g.Exe) $($g.Argv -join ' ')`n$(Tail $r.Out 20)"
        }
        Say "gate ok: $($g.Exe) $($g.Argv -join ' ')"
    }
}

function Invoke-Push {
    $br = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')).Out.Trim()
    if ($br -ne $Branch) {
        Die "current branch is '$br', expected '$Branch'. Run: git -C $script:RepoPath checkout $Branch"
    }
    $origin = Invoke-Git @('remote', 'get-url', 'origin')
    if ($origin.Code -ne 0) { Die "no git remote 'origin' in $script:RepoPath" }

    Assert-EnvSafe
    Invoke-QualityGates

    $st = Invoke-Git @('status', '--porcelain')
    if ($st.Out.Trim()) {
        $a = Invoke-Git @('add', '-A')
        if ($a.Code -ne 0) { Die "git add failed: $(Tail $a.Out)" }
        $msg = $Message
        if (-not $msg) { $msg = 'deploy: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }
        $c = Invoke-Git @('commit', '-m', $msg)
        if ($c.Code -ne 0) { Die "git commit failed: $(Tail $c.Out)" }
        Say "committed: $msg"
    }
    else {
        Say 'no local changes, skipping commit'
    }

    $pull = Invoke-Git @('pull', '--rebase', 'origin', $Branch)
    if ($pull.Code -ne 0) {
        Die "git pull --rebase failed (never force-push):`n$(Tail $pull.Out 20)"
    }

    $push = Invoke-Git @('push', 'origin', $Branch)
    if (($push.Code -ne 0) -and (Is-AuthError $push.Out)) {
        Say 'git auth failed, refreshing platform credential once'
        $ref = Cli @('apps', '+git-credential-init', '--app-id', $script:AppId, '--as', 'user')
        if ($ref.Code -ne 0) { Die "credential refresh failed:`n$(Tail $ref.Out 12)" }
        $push = Invoke-Git @('push', 'origin', $Branch)
    }
    if ($push.Code -ne 0) { Die "git push failed:`n$(Tail $push.Out 20)" }
    Say "push done: origin $Branch"
}

function Invoke-Release {
    if (-not $Reason) {
        Die 'release requires -Reason, and requires Leyinet approval each time (task book W51)'
    }
    Invoke-Push

    $r = Cli @('apps', '+release-create', '--as', 'user', '--app-id', $script:AppId,
               '--branch', $Branch, '--apply-reason', $Reason)
    if ($r.Code -ne 0) { Die "release-create failed:`n$(Tail $r.Out 20)" }

    $rid = $null
    if ($r.Out -match '"release_id"\s*:\s*"([^"]+)"') { $rid = $Matches[1] }
    elseif ($r.Out -match '"releaseId"\s*:\s*"([^"]+)"') { $rid = $Matches[1] }
    if (-not $rid) {
        Say "release created but release_id not parsed; poll manually:`n$(Tail $r.Out 20)"
        return
    }
    Say "release id: $rid (polling up to 5 minutes)"

    $deadline = (Get-Date).AddSeconds(300)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 20
        $q = Cli @('apps', '+release-get', '--as', 'user', '--app-id', $script:AppId, '--release-id', $rid)
        $t = $q.Out
        if ($t -match '"status"\s*:\s*"finished"') { Say 'release finished'; return }
        if ($t -match '"status"\s*:\s*"failed"') { Die "release failed:`n$(Tail $t 20)" }
        if ($t -match '"current_status"\s*:\s*"PENDING"') {
            Say "waiting for approver; stop polling. release id: $rid"; return
        }
        if ($t -match '"status"\s*:\s*"pending"') {
            Say "status pending without approval node; stop polling. release id: $rid"; return
        }
        if ($q.Code -ne 0) { Say 'release-get returned an error, will retry' }
        Say 'still publishing...'
    }
    Say "timeout; release id $rid, check status manually"
}

# ---- main ------------------------------------------------------------------
if (-not $Repo) { Die 'give -Repo <path> or set MIAODA_REPO_DIR' }
$script:RepoPath = [System.IO.Path]::GetFullPath($Repo)
if (-not (Test-Path $script:RepoPath -PathType Container)) { Die "repo dir not found: $script:RepoPath" }
if ($Source) {
    $script:GitHubApp = [System.IO.Path]::GetFullPath($Source)
}
else {
    $script:GitHubApp = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\app'))
}

$script:GitExe = Resolve-Git
if (-not $script:GitExe) { Die 'git not found; install Git for Windows or add it to PATH' }

$script:CliExe = Resolve-Exe 'lark-cli.cmd'
if (-not $script:CliExe) { $script:CliExe = Resolve-Exe 'lark-cli' }

if (-not $AppId) {
    $meta = Join-Path $script:RepoPath '.spark/meta.json'
    if (Test-Path $meta) {
        try { $AppId = (Get-Content $meta -Raw | ConvertFrom-Json).app_id } catch { }
    }
}
$script:AppId = $AppId

if ($Mode -eq 'check') {
    Say "repo: $script:RepoPath"
    $isGit = Invoke-Git @('rev-parse', '--is-inside-work-tree')
    Say "git repo: $(if ($isGit.Code -eq 0) { 'OK' } else { 'MISSING' })"
    $br = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')).Out.Trim()
    Say "branch: $br (expected $Branch) $(if ($br -eq $Branch) { 'OK' } else { 'MISMATCH' })"
    $origin = Invoke-Git @('remote', 'get-url', 'origin')
    Say "origin: $(if ($origin.Code -eq 0) { $origin.Out.Trim() } else { 'MISSING' })"
    Say "lark-cli: $(if ($script:CliExe) { $script:CliExe } else { 'MISSING (npx @larksuite/cli@latest install)' })"
    Say "app_id: $(if ($script:AppId) { $script:AppId } else { 'MISSING (.spark/meta.json or -AppId)' })"

    $gi = Join-Path $script:RepoPath '.gitignore'
    $giText = if (Test-Path $gi) { Get-Content $gi -Raw } else { '' }
    Say ".gitignore excludes .env: $(if ($giText -match '(?m)^\.env') { 'OK' } else { 'MISSING - add .env and .env.* before any commit' })"

    $pkg = Join-Path $script:RepoPath 'package.json'
    if (Test-Path $pkg) {
        $p = Get-Content $pkg -Raw | ConvertFrom-Json
        foreach ($s in @('test', 'smoke', 'preview:build', 'type:check:server')) {
            Say "package.json script $s : $(if ($p.scripts.PSObject.Properties[$s]) { 'OK' } else { 'MISSING' })"
        }
    }
    else { Say 'package.json: MISSING' }

    foreach ($f in @('.env', '.env.local')) {
        Say "$f present: $(if (Test-Path (Join-Path $script:RepoPath $f)) { 'yes (content not printed)' } else { 'no' })"
    }
    $st = Invoke-Git @('status', '--porcelain')
    $leak = @($st.Out -split "`r?`n" | Where-Object { $_ -match '(^|/)\.env' -and $_ -notmatch '\.env\.example' })
    Say "env files in git status: $(if ($leak.Count -eq 0) { 'none' } else { 'FOUND - fix before push' })"
    Say 'check done (nothing was pushed or released)'
    exit 0
}

if ($Mode -eq 'sync' -or $Mode -eq 'backup') {
    Say "github working copy: $script:GitHubApp"
    Say "miaoda working copy: $script:RepoPath"
    if ($DryRun) { Say 'DRY RUN: no file will be written' }
    $noProtect = @()
    if ($Mode -eq 'sync') {
        $protect = $script:SyncProtect
        if ($ForceProtected) {
            $protect = @('.spark/', '.spark_project', '.gitignore', '.npmrc',
                         'package.json', 'package-lock.json')
            Say 'WARNING: -ForceProtected overwrites index.tsx, main.ts, schema.ts, dev*.js, vite.config.ts and skills/'
            Say 'direction: github app -> miaoda repo (extended override)'
        }
        else {
            Say 'direction: github app -> miaoda repo (platform-owned files stay untouched)'
        }
        $null = Invoke-TreeSync -From $script:GitHubApp -To $script:RepoPath `
            -Protect $protect -MergePackage -NoWrite:$DryRun
        if ($DryRun) { Say 'dry run done'; exit 0 }
        Show-Pending $script:RepoPath
    }
    else {
        Say 'direction: miaoda repo -> github app (full mirror of business files)'
        $null = Invoke-TreeSync -From $script:RepoPath -To $script:GitHubApp `
            -Protect $noProtect -NoWrite:$DryRun
        if ($DryRun) { Say 'dry run done'; exit 0 }
        $ghRoot = [System.IO.Path]::GetFullPath((Join-Path $script:GitHubApp '..'))
        $r = Invoke-Tool -Exe $script:GitExe -Argv @('-C', $ghRoot, 'status', '--short') -WorkDir $ghRoot
        $lines = @($r.Out -split "`r?`n" | Where-Object { $_.Trim() })
        Say "github repo pending: $($lines.Count) change(s)"
        $lines | Select-Object -First 15 | ForEach-Object { Say "  $_" }
    }
    Say 'review the diff, then run: -Mode gates / -Mode push / -Mode release'
    Say 'sync/backup never commits, pushes or releases by itself'
    exit 0
}

if (-not $script:CliExe) { Die 'lark-cli not found. Install: npx @larksuite/cli@latest install' }
if (-not $script:AppId) { Die 'app_id missing; pass -AppId or set MIAODA_APP_ID, or run +init first' }

if ($Mode -eq 'gates') { Invoke-QualityGates; Say 'gates done (nothing pushed or released)'; exit 0 }
if ($Mode -eq 'push') { Invoke-Push; exit 0 }
if ($Mode -eq 'release') { Invoke-Release; exit 0 }
