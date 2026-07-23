import './styles/style.scss';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jspreadsheet-ce/dist/jspreadsheet.themes.css';
import { mount } from 'svelte';
import Knowledge from './pages/Knowledge.svelte';

mount(Knowledge, {
  target: document.getElementById('app'),
});
