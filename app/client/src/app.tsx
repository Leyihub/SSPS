import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import WorkbenchPage from './pages/Workbench/WorkbenchPage';
import MasterPage from './pages/Master/MasterPage';
import BerthPlanPage from './pages/BerthPlan/BerthPlanPage';
import CapacityPage from './pages/Capacity/CapacityPage';
import AskPage from './pages/Ask/AskPage';
import PredictionDetailPage from './pages/Predict/PredictionDetailPage';
import PredictPage from './pages/Predict/PredictPage';
import VoyageListPage from './pages/Voyages/VoyageListPage';
import VoyageDetailPage from './pages/Voyages/VoyageDetailPage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WorkbenchPage />} />
        <Route path="master" element={<MasterPage />} />
        <Route path="berth-plans" element={<BerthPlanPage />} />
        <Route path="calendar" element={<CapacityPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="predict" element={<PredictPage />} />
        <Route path="predictions/:runNo" element={<PredictionDetailPage />} />
        <Route path="voyages" element={<VoyageListPage />} />
        <Route path="voyages/:id" element={<VoyageDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
