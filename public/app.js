const state = {
  dashboard: null,
  tasks: [],
  profits: [],
  ideas: [],
  inbox: [],
  reviews: []
};

const selectors = {
  app: document.getElementById('app'),
  dashboardDate: document.getElementById('dashboardDate'),
  statTasksToday: document.getElementById('statTasksToday'),
  statTasksTomorrow: document.getElementById('statTasksTomorrow'),
  statTasksOverdue: document.getElementById('statTasksOverdue'),
  statProfitToday: document.getElementById('statProfitToday'),
  statProfit7: document.getElementById('statProfit7'),
  statProfit30: document.getElementById('statProfit30'),
  statIdeas: document.getElementById('statIdeas'),
  statInbox: document.getElementById('statInbox'),
  focusList: document.getElementById('focusList'),
  taskForm: document.getElementById('taskForm'),
  taskError: document.getElementById('taskError'),
  taskToday: document.getElementById('taskToday'),
  taskTomorrow: document.getElementById('taskTomorrow'),
  taskOverdue: document.getElementById('taskOverdue'),
  taskUpcoming: document.getElementById('taskUpcoming'),
  profitForm: document.getElementById('profitForm'),
  profitError: document.getElementById('profitError'),
  profitTable: document.querySelector('#profitTable tbody'),
  ideaForm: document.getElementById('ideaForm'),
  ideaError: document.getElementById('ideaError'),
  ideaList: document.getElementById('ideaList'),
  inboxForm: document.getElementById('inboxForm'),
  inboxError: document.getElementById('inboxError'),
  inboxList: document.getElementById('inboxList'),
  reviewForm: document.getElementById('reviewForm'),
  reviewError: document.getElementById('reviewError'),
  reviewList: document.getElementById('reviewList'),
  taskTemplate: document.getElementById('taskItemTemplate'),
  ideaTemplate: document.getElementById('ideaItemTemplate'),
  inboxTemplate: document.getElementById('inboxItemTemplate')
};

function showError(element, message) {
  element.textContent = message;
  if (message) {
    setTimeout(() => {
      if (element.textContent === message) {
        element.textContent = '';
      }
    }, 4000);
  }
}

async function fetchJSON(url, options = {}) {
  const { body, headers, ...rest } = options;
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {})
    },
    ...rest
  };
  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const message = data?.error || response.statusText || '请求失败';
    const err = new Error(message);
    err.data = data;
    err.status = response.status;
    throw err;
  }
  return data || {};
}

async function bootstrap() {
  selectors.app.classList.remove('hidden');
  try {
    await loadAllData();
  } catch (error) {
    console.warn('初始化数据失败', error);
  }
}

async function loadAllData() {
  await Promise.allSettled([
    loadDashboard(),
    loadTasks(),
    loadProfits(),
    loadIdeas(),
    loadInbox(),
    loadReviews()
  ]);
}

async function loadDashboard() {
  try {
    const data = await fetchJSON('/api/dashboard');
    state.dashboard = data;
    updateDashboard();
  } catch (error) {
    console.error('加载仪表盘失败', error);
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateDashboard() {
  if (!state.dashboard) {
    return;
  }
  const { today, tasks, profits, ideas, inbox, focus } = state.dashboard;
  selectors.dashboardDate.textContent = today;
  selectors.statTasksToday.textContent = tasks.todayTasks.length;
  selectors.statTasksTomorrow.textContent = tasks.tomorrowTasks.length;
  selectors.statTasksOverdue.textContent = tasks.overdue.length;
  selectors.statProfitToday.textContent = `$${formatCurrency(profits.todayTotal)}`;
  selectors.statProfit7.textContent = `$${formatCurrency(profits.sevenDayTotal)}`;
  selectors.statProfit30.textContent = `$${formatCurrency(profits.thirtyDayTotal)}`;
  selectors.statIdeas.textContent = ideas.incubating;
  selectors.statInbox.textContent = inbox.total;

  selectors.focusList.innerHTML = '';
  if (!focus || focus.length === 0) {
    const li = document.createElement('li');
    li.textContent = '选择 1-3 个最重要的任务作为今天的推进目标。';
    selectors.focusList.appendChild(li);
  } else {
    focus.forEach((task) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${task.title}</strong><div class="muted">${task.category || '未分类'} · 优先级 ${task.priority}</div>`;
      selectors.focusList.appendChild(li);
    });
  }
}

function partitionTasks(tasks) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const overdue = [];
  const todayTasks = [];
  const tomorrowTasks = [];
  const upcoming = [];
  const completed = [];

  tasks.forEach((task) => {
    if (task.status === 'done') {
      completed.push(task);
      return;
    }
    if (!task.dueDate) {
      upcoming.push(task);
      return;
    }
    if (task.dueDate === todayStr) {
      todayTasks.push(task);
    } else if (task.dueDate === tomorrowStr) {
      tomorrowTasks.push(task);
    } else if (task.dueDate < todayStr) {
      overdue.push(task);
    } else {
      upcoming.push(task);
    }
  });

  return { todayTasks, tomorrowTasks, overdue, upcoming, completed };
}

function createButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', handler);
  return button;
}

async function loadTasks() {
  try {
    const data = await fetchJSON('/api/tasks');
    state.tasks = data.tasks || [];
    renderTasks();
  } catch (error) {
    console.error('加载任务失败', error);
  }
}

function renderTasks() {
  const partitions = partitionTasks(state.tasks);
  renderTaskList(selectors.taskToday, partitions.todayTasks);
  renderTaskList(selectors.taskTomorrow, partitions.tomorrowTasks);
  renderTaskList(selectors.taskOverdue, partitions.overdue);
  renderTaskList(selectors.taskUpcoming, partitions.upcoming);
}

function renderTaskList(container, tasks) {
  container.innerHTML = '';
  if (!tasks.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = '暂无记录';
    container.appendChild(empty);
    return;
  }
  tasks.forEach((task) => {
    const fragment = selectors.taskTemplate.content.cloneNode(true);
    const item = fragment.querySelector('.task-item');
    if (task.status === 'done') {
      item.classList.add('done');
    }
    fragment.querySelector('h4').textContent = task.title;
    const metaParts = [];
    if (task.dueDate) {
      metaParts.push(`截止 ${task.dueDate}`);
    }
    if (task.priority) {
      metaParts.push(`优先级 ${task.priority}`);
    }
    if (task.category) {
      metaParts.push(task.category);
    }
    if (task.tags?.length) {
      metaParts.push(`#${task.tags.join(' #')}`);
    }
    fragment.querySelector('.meta').textContent = metaParts.join(' · ');
    fragment.querySelector('.note').textContent = task.description || '';
    const actions = fragment.querySelector('.task-actions');

    if (task.status !== 'done') {
      actions.appendChild(
        createButton('完成', 'primary compact', async () => {
          await updateTask(task.id, { status: 'done' });
        })
      );
      actions.appendChild(
        createButton('推进中', 'ghost compact', async () => {
          await updateTask(task.id, { status: 'in-progress' });
        })
      );
      actions.appendChild(
        createButton('明日跟进', 'ghost compact', async () => {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 1);
          await updateTask(task.id, { dueDate: nextDate.toISOString().slice(0, 10) });
        })
      );
    } else {
      actions.appendChild(
        createButton('恢复', 'ghost compact', async () => {
          await updateTask(task.id, { status: 'pending' });
        })
      );
    }

    actions.appendChild(
      createButton('转为想法', 'ghost compact', () => {
        prefillIdeaForm(task.title, task.description);
      })
    );

    actions.appendChild(
      createButton('删除', 'danger compact', async () => {
        if (confirm('确定要删除该任务吗？')) {
          await deleteTask(task.id);
        }
      })
    );

    container.appendChild(fragment);
  });
}

async function updateTask(id, updates) {
  try {
    await fetchJSON(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: updates
    });
    await Promise.all([loadTasks(), loadDashboard()]);
  } catch (error) {
    showError(selectors.taskError, error.message);
  }
}

async function deleteTask(id) {
  try {
    await fetchJSON(`/api/tasks/${id}`, { method: 'DELETE' });
    await Promise.all([loadTasks(), loadDashboard()]);
  } catch (error) {
    showError(selectors.taskError, error.message);
  }
}

selectors.taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.title) {
    showError(selectors.taskError, '请输入任务标题');
    return;
  }
  if (payload.tags) {
    payload.tags = payload.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  if (!payload.estimatedMinutes) {
    delete payload.estimatedMinutes;
  }
  try {
    await fetchJSON('/api/tasks', {
      method: 'POST',
      body: payload
    });
    form.reset();
    await Promise.all([loadTasks(), loadDashboard()]);
  } catch (error) {
    showError(selectors.taskError, error.message);
  }
});

async function loadProfits() {
  try {
    const data = await fetchJSON('/api/profits');
    state.profits = data.profits || [];
    renderProfits();
  } catch (error) {
    console.error('加载收益失败', error);
  }
}

function renderProfits() {
  selectors.profitTable.innerHTML = '';
  if (!state.profits.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = '暂无记录';
    cell.className = 'muted';
    row.appendChild(cell);
    selectors.profitTable.appendChild(row);
    return;
  }

  state.profits.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.date || ''}</td>
      <td>$${formatCurrency(entry.amount)}</td>
      <td>${entry.strategy || ''}</td>
      <td>${entry.chain || entry.market || ''}</td>
      <td>${entry.notes || ''}</td>
      <td></td>
    `;
    const actionsCell = row.querySelector('td:last-child');
    const deleteButton = createButton('删除', 'danger compact', async () => {
      if (confirm('确定删除这条收益记录吗？')) {
        await deleteProfit(entry.id);
      }
    });
    actionsCell.appendChild(deleteButton);
    selectors.profitTable.appendChild(row);
  });
}

async function deleteProfit(id) {
  try {
    await fetchJSON(`/api/profits/${id}`, { method: 'DELETE' });
    await Promise.all([loadProfits(), loadDashboard()]);
  } catch (error) {
    showError(selectors.profitError, error.message);
  }
}

selectors.profitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    await fetchJSON('/api/profits', {
      method: 'POST',
      body: payload
    });
    event.target.reset();
    await Promise.all([loadProfits(), loadDashboard()]);
  } catch (error) {
    showError(selectors.profitError, error.message);
  }
});

async function loadIdeas() {
  try {
    const data = await fetchJSON('/api/ideas');
    state.ideas = data.ideas || [];
    renderIdeas();
  } catch (error) {
    console.error('加载想法失败', error);
  }
}

function renderIdeas() {
  selectors.ideaList.innerHTML = '';
  if (!state.ideas.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = '还没有灵感，快速写下一条吧。';
    selectors.ideaList.appendChild(empty);
    return;
  }

  state.ideas.forEach((idea) => {
    const fragment = selectors.ideaTemplate.content.cloneNode(true);
    fragment.querySelector('h4').textContent = idea.title;
    fragment.querySelector('.tags').textContent = idea.tags?.length ? `#${idea.tags.join(' #')}` : '';
    fragment.querySelector('.detail').textContent = idea.detail || '';
    const actions = fragment.querySelector('.idea-actions');

    actions.appendChild(
      createButton('推进执行', 'primary compact', async () => {
        await updateIdea(idea.id, { status: 'active' });
      })
    );

    actions.appendChild(
      createButton('转成任务', 'ghost compact', () => {
        prefillTaskForm(idea.title, idea.detail, idea.tags);
      })
    );

    actions.appendChild(
      createButton('归档', 'ghost compact', async () => {
        await updateIdea(idea.id, { status: 'archived' });
      })
    );

    actions.appendChild(
      createButton('删除', 'danger compact', async () => {
        if (confirm('确认删除该想法？')) {
          await deleteIdea(idea.id);
        }
      })
    );

    selectors.ideaList.appendChild(fragment);
  });
}

function prefillTaskForm(title, description = '', tags = []) {
  selectors.taskForm.title.value = title || '';
  selectors.taskForm.description.value = description || '';
  selectors.taskForm.tags.value = Array.isArray(tags) ? tags.join(', ') : tags || '';
  selectors.taskForm.scrollIntoView({ behavior: 'smooth' });
}

function prefillIdeaForm(title, detail = '') {
  selectors.ideaForm.title.value = title || '';
  selectors.ideaForm.detail.value = detail || '';
  selectors.ideaForm.scrollIntoView({ behavior: 'smooth' });
}

selectors.ideaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  if (payload.tags) {
    payload.tags = payload.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  try {
    await fetchJSON('/api/ideas', {
      method: 'POST',
      body: payload
    });
    event.target.reset();
    await loadIdeas();
    await loadDashboard();
  } catch (error) {
    showError(selectors.ideaError, error.message);
  }
});

async function updateIdea(id, updates) {
  try {
    await fetchJSON(`/api/ideas/${id}`, {
      method: 'PATCH',
      body: updates
    });
    await loadIdeas();
    await loadDashboard();
  } catch (error) {
    showError(selectors.ideaError, error.message);
  }
}

async function deleteIdea(id) {
  try {
    await fetchJSON(`/api/ideas/${id}`, { method: 'DELETE' });
    await loadIdeas();
    await loadDashboard();
  } catch (error) {
    showError(selectors.ideaError, error.message);
  }
}

async function loadInbox() {
  try {
    const data = await fetchJSON('/api/inbox');
    state.inbox = data.inbox || [];
    renderInbox();
  } catch (error) {
    console.error('加载收件箱失败', error);
  }
}

function renderInbox() {
  selectors.inboxList.innerHTML = '';
  if (!state.inbox.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = '把所有灵感先扔到这里，保持大脑清爽。';
    selectors.inboxList.appendChild(empty);
    return;
  }

  state.inbox.forEach((entry) => {
    const fragment = selectors.inboxTemplate.content.cloneNode(true);
    fragment.querySelector('.content').textContent = entry.content;
    fragment.querySelector('.timestamp').textContent = new Date(entry.createdAt).toLocaleString();
    const actions = fragment.querySelector('.inbox-actions');

    actions.appendChild(
      createButton('转任务', 'primary compact', () => {
        prefillTaskForm(entry.content, '', [entry.type]);
      })
    );

    actions.appendChild(
      createButton('转想法', 'ghost compact', () => {
        prefillIdeaForm(entry.content, '来自收件箱的记录');
      })
    );

    actions.appendChild(
      createButton('删除', 'danger compact', async () => {
        await deleteInbox(entry.id);
      })
    );

    selectors.inboxList.appendChild(fragment);
  });
}

selectors.inboxForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.content) {
    showError(selectors.inboxError, '请输入内容');
    return;
  }
  try {
    await fetchJSON('/api/inbox', { method: 'POST', body: payload });
    event.target.reset();
    await loadInbox();
    await loadDashboard();
  } catch (error) {
    showError(selectors.inboxError, error.message);
  }
});

async function deleteInbox(id) {
  try {
    await fetchJSON(`/api/inbox/${id}`, { method: 'DELETE' });
    await loadInbox();
    await loadDashboard();
  } catch (error) {
    showError(selectors.inboxError, error.message);
  }
}

async function loadReviews() {
  try {
    const data = await fetchJSON('/api/reviews');
    state.reviews = data.reviews || [];
    renderReviews();
  } catch (error) {
    console.error('加载复盘失败', error);
  }
}

function renderReviews() {
  selectors.reviewList.innerHTML = '';
  if (!state.reviews.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = '每天花 3 分钟整理亮点与阻碍，建立自己的套利 playbook。';
    selectors.reviewList.appendChild(empty);
    return;
  }

  state.reviews
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 14)
    .forEach((review) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <h4>${review.date}</h4>
          <p><strong>亮点：</strong>${review.highlight || '暂无'}</p>
          <p><strong>经验：</strong>${review.lessons || '暂无'}</p>
          <p><strong>阻碍：</strong>${review.blockers || '暂无'}</p>
          <p><strong>状态：</strong>${review.mood || '未填写'}</p>
        </div>
      `;
      selectors.reviewList.appendChild(li);
    });
}

selectors.reviewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    await fetchJSON('/api/reviews', { method: 'POST', body: payload });
    event.target.reset();
    await loadReviews();
  } catch (error) {
    showError(selectors.reviewError, error.message);
  }
});

bootstrap();
