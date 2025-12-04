import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode can sometimes cause double-invocations which mess with PeerJS connections in dev.
  // We keep it for best practices but handle cleanup carefully.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);