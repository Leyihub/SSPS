import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import WorkbenchPage from './pages/Workbench/WorkbenchPage';
import PredictPage from './pages/Predict/PredictPage';
import VoyageListPage from './pages/Voyages/VoyageListPage';
import VoyageDetailPage from './pages/Voyages/VoyageDetailPage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WorkbenchPage />} />
        <Route path="predict" element={<PredictPage />} />
        <Route path="voyages" element={<VoyageListPage />} />
        <Route path="voyages/:id" element={<VoyageDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
