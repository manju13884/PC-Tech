import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './features/calculator-module.css'
import { watchDeploymentMaintenance } from './deploymentMaintenance'
import { watchRequestActivity } from './requestActivity'
import RequestActivityIndicator from './RequestActivityIndicator'

watchDeploymentMaintenance()
watchRequestActivity()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <RequestActivityIndicator />
  </React.StrictMode>,
)
