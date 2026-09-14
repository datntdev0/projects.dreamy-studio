const FLOW = '[data-flow]';
const TAB = '[role="tab"]';
const PANEL = '[role="tabpanel"]';

function tabsOf(flow) {
  return [...flow.querySelectorAll(TAB)];
}

function activate(flow, index) {
  const tabs = tabsOf(flow);
  const panels = [...flow.querySelectorAll(PANEL)];
  const target = Math.max(0, Math.min(index, tabs.length - 1));
  tabs.forEach((tab, position) => {
    const selected = position === target;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle('is-done', position < target);
  });
  panels.forEach((panel, position) => {
    panel.hidden = position !== target;
  });
  flow.style.setProperty('--progress', String(target / Math.max(tabs.length - 1, 1)));
  return tabs[target];
}

function selectedIndex(flow) {
  return tabsOf(flow).findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
}

function handleTabClick(event) {
  const tab = event.currentTarget;
  const flow = tab.closest(FLOW);
  activate(flow, tabsOf(flow).indexOf(tab));
}

function handleStepNav(event) {
  const button = event.currentTarget;
  const flow = button.closest(FLOW);
  const offset = button.dataset.stepNav === 'next' ? 1 : -1;
  activate(flow, selectedIndex(flow) + offset).focus();
}

function handleTabKeys(event) {
  const keys = { ArrowRight: 1, ArrowLeft: -1 };
  const offset = keys[event.key];
  if (!offset) return;
  event.preventDefault();
  const flow = event.currentTarget.closest(FLOW);
  activate(flow, selectedIndex(flow) + offset).focus();
}

function initFlow(flow) {
  for (const tab of tabsOf(flow)) {
    tab.addEventListener('click', handleTabClick);
    tab.addEventListener('keydown', handleTabKeys);
  }
  for (const button of flow.querySelectorAll('[data-step-nav]')) {
    button.addEventListener('click', handleStepNav);
  }
  activate(flow, 0);
}

function initFlows() {
  document.documentElement.classList.add('has-flows');
  document.querySelectorAll(FLOW).forEach(initFlow);
}

initFlows();
