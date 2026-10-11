// Options 入口：渲染 Preact App，取代 Phase 1 占位文案。
import { render, h } from 'preact';
import App from './App';
import './styles/options.css';

const root = document.getElementById('root');
if (root) render(h(App, null), root);
