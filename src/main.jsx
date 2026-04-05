import { render } from 'preact'
import App from './app.jsx'
import './index.css'
import './print.css'
import { applyThemePreference, getStoredThemePreference } from './utils/themePreference'

applyThemePreference(getStoredThemePreference())

render(<App />, document.getElementById('app'))
