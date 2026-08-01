import { createRoot } from 'react-dom/client'
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'
import './styles.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <DialRoot theme="dark" position="top-right" defaultOpen={true} productionEnabled={true} />
  </>
)
