import './main.css';

import { render } from 'preact';

import { AdminApp } from './admin/AdminApp';
import { App } from './app/App';

const admin = location.pathname.startsWith('/admin');
render(admin ? <AdminApp /> : <App />, document.getElementById('app')!);
