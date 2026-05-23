(function () {
  const data = window.AI_DAILY_DATA;
  const state = {
    category: "全部",
    query: "",
    compact: false
  };

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  });

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const safeUrl = (value) => {
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) || url.pathname.startsWith("/archive/")
        ? url.href
        : "#";
    } catch {
      return "#";
    }
  };

  function renderShell() {
    $("#dateLine").textContent = `${formatter.format(new Date(data.generatedAt))} 生成`;
    $("#sourceCount").textContent = data.scannedSources;
    $("#candidateCount").textContent = data.candidates;
    $("#selectedCount").textContent = data.stories.length;
    $("#briefSummary").textContent = data.brief;

    $("#impactList").innerHTML = data.impacts
      .map(
        (impact) => `
          <article>
            <strong>${escapeHtml(impact.title)}</strong>
            <span>${escapeHtml(impact.body)}</span>
          </article>
        `
      )
      .join("");

    $("#weeklyList").innerHTML = (data.weeklyHot || [])
      .map(
        (item, index) => `
          <article class="weekly-item">
            <div class="weekly-rank">${index + 1}</div>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>热度 ${Number(item.heat) || 0} · ${escapeHtml(item.source)}</span>
              <a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">查看来源</a>
            </div>
          </article>
        `
      )
      .join("");

    $("#archiveList").innerHTML = data.archives
      .map(
        (item) => `
          <article class="archive-item">
            <strong>${escapeHtml(item.date)}</strong>
            <span>${escapeHtml(item.title)}</span>
            <span>${Number(item.count) || 0} 条入选</span>
            <a class="archive-link" href="${safeUrl(item.url)}">查看日报</a>
          </article>
        `
      )
      .join("");

    $("#sourceList").innerHTML = (data.sourceCatalog || [])
      .map(
        (source) => `
          <article class="source-item">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${escapeHtml(source.tier)} · ${escapeHtml(source.category)}</span>
            <a href="${safeUrl(source.url)}" target="_blank" rel="noreferrer">打开信息源</a>
          </article>
        `
      )
      .join("");

    $("#categoryTabs").innerHTML = data.categories
      .map(
        (category) => `
          <button class="segment" type="button" role="tab" aria-selected="${category === state.category}" data-category="${category}">
            ${escapeHtml(category)}
          </button>
        `
      )
      .join("");
  }

  function storyMatches(story) {
    const inCategory = state.category === "全部" || story.category === state.category;
    const haystack = [story.title, story.summary, story.source, story.category, ...story.tags]
      .join(" ")
      .toLowerCase();
    return inCategory && haystack.includes(state.query.toLowerCase());
  }

  function renderStories() {
    const stories = data.stories.filter(storyMatches);
    $("#selectedCount").textContent = stories.length;

    if (!stories.length) {
      $("#storyList").innerHTML = `
        <article class="story-card">
          <div class="score"><strong>0</strong><span>signals</span></div>
          <div class="story-main">
            <h3>没有匹配结果</h3>
            <p>换一个关键词或回到全部分类。</p>
          </div>
        </article>
      `;
      return;
    }

    $("#storyList").innerHTML = stories
      .map(
        (story) => `
          <article class="story-card">
            <div class="score">
              <strong>${story.score}</strong>
              <span>score</span>
            </div>
            <div class="story-main">
              <div class="story-meta">
                <span class="pill tier ${tierClass(story.tier)}">${escapeHtml(story.tier)}</span>
                <span class="pill">${escapeHtml(story.category)}</span>
                ${story.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
              </div>
              <h3>${escapeHtml(story.title)}</h3>
              <p>${escapeHtml(story.summary)}</p>
              <div class="story-footer">
                <span>${escapeHtml(story.why)}</span>
                <a class="source-link" href="${safeUrl(story.url)}" target="_blank" rel="noreferrer">
                  ${escapeHtml(story.source)}
                </a>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  }

  function tierClass(tier) {
    if (tier === "T1") return "tier-t1";
    if (tier === "T1.5") return "tier-t15";
    return "tier-t2";
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("visible");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => node.classList.remove("visible"), 2600);
  }

  function bindEvents() {
    $("#categoryTabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      renderShell();
      renderStories();
    });

    $("#searchInput").addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      renderStories();
    });

    $("#compactBtn").addEventListener("click", () => {
      state.compact = !state.compact;
      document.body.classList.toggle("compact", state.compact);
      $("#compactBtn").setAttribute("aria-pressed", String(state.compact));
      toast(state.compact ? "已切换为紧凑视图" : "已切换为标准视图");
    });

    $("#generateBtn").addEventListener("click", () => {
      toast("请在终端运行 python3 ai-daily/scripts/generate_daily.py 生成真实日报。");
    });

    $("#subscribeForm").addEventListener("submit", (event) => {
      event.preventDefault();
      toast("订阅设置已保存到本地原型。");
    });
  }

  renderShell();
  renderStories();
  bindEvents();
})();
