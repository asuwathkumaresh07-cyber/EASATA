import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import Shell from './components/Shell';
import Overview from './pages/Overview';
import Alerts from './pages/Alerts';
import AlertDetail from './pages/AlertDetail';
import Inbox from './pages/Inbox';
import Respond from './pages/Respond';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Customer from './pages/Customer';
import Evaluation from './pages/Evaluation';
import SimLayout from './pages/sim/SimLayout';
import SimRun from './pages/sim/SimRun';
import SimDashboard from './pages/sim/SimDashboard';
import SimAlerts from './pages/sim/SimAlerts';
import SimAlert from './pages/sim/SimAlert';
import SimEval from './pages/sim/SimEval';
import SimFreeze from './pages/sim/SimFreeze';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/respond" element={<Respond />} />
      <Route element={<Shell />}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/alerts/:id" element={<AlertDetail />} />
        <Route path="/simulate" element={<SimLayout />}>
          <Route index element={<SimRun />} />
          <Route path="dashboard" element={<SimDashboard />} />
          <Route path="alerts" element={<SimAlerts />} />
          <Route path="alerts/:n" element={<SimAlert />} />
          <Route path="evaluation" element={<SimEval />} />
          <Route path="freeze/:n" element={<SimFreeze />} />
          <Route path="*" element={<Navigate to="/simulate" replace />} />
        </Route>
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/customers/:id" element={<Customer />} />
        <Route path="/evaluation" element={<Evaluation />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
