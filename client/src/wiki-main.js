import './styles/style.scss';
import { mount } from 'svelte';
import Knowledge from './pages/Knowledge.svelte';

mount(Knowledge, {
  target: document.getElementById('app'),
});
