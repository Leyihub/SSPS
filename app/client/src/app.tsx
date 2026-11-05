import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import VoyageListPage from './pages/Voyages/VoyageListPage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<VoyageListPage />} />
        <Route path="voyages" element={<VoyageListPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
