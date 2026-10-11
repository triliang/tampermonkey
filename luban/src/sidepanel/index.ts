import { render, h } from 'preact';
import App from './App';
import './styles/panel.css';

const root = document.getElementById('root');
if (root) render(h(App, null), root);
