"use strict";
const el = id => document.getElementById(id);
const colors = ["emerald", "amber", "slate", "rose", "indigo"];
const state = { books: [], category: "", list: false, feature: null };
const collate = new Intl.Collator("zh-CN", { numeric: true });
const normalize = value => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s《》：:·•\-—_]/gu, "");
function node(tag, value, cls) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (cls) element.className = cls;
  return element;
}

function fileInfo(path) {
  const parts = path.replace(/^\//, "").split("/");
  if (!parts.every(p => p && p !== "." && p !== ".." && !p.includes("\\"))) return null;
  const filename = parts.pop();
  if (!/\.pdf$/i.test(filename)) return null;
  const stem = filename.slice(0, -4);
  const [title, ...authors] = stem.split(/\s+[-—]\s+/);
  return {
    title: title || stem, author: authors.join(" - "), filename,
    category: parts.length && parts[parts.length - 1] !== "books" ? parts[parts.length - 1] : "未分类",
    url: "./" + [...parts, filename].map(encodeURIComponent).join("/")
  };
}

function buildCatalog(records, paths) {
  const books = records.filter(b => b && typeof b.title === "string").map(b => ({ ...b, files: [] }));
  const seen = new Set();
  for (const path of paths) {
    const file = fileInfo(path);
    if (!file || seen.has(file.url)) continue;
    seen.add(file.url);
    const title = normalize(file.title);
    const matches = books.filter(b => normalize(b.title) === title || normalize(b.title.split(/[：:]/)[0]) === title);
    let book = file.author ? matches.find(b => normalize(b.author) === normalize(file.author)) : null;
    if (!book && matches.length === 1 && (!file.author || !matches[0].author)) book = matches[0];
    if (!book) {
      book = { title: file.title, author: file.author, category: file.category, files: [], color: colors[books.length % colors.length] };
      books.push(book);
    }
    book.files.push(file);
  }
  return books;
}

async function json(url) {
  const response = await fetch(url, {cache: "no-cache"});
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}
async function pdfPaths() {
  try {
    const paths = await json("./pdf-index.json");
    if (!Array.isArray(paths) || !paths.every(p => typeof p === "string")) throw new Error();
    return paths;
  } catch {
    const tree = await json("https://api.github.com/repos/roysean24/-/git/trees/main?recursive=1");
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("Incomplete listing");
    return tree.tree.filter(f => f.type === "blob" && /\.pdf$/i.test(f.path)).map(f => f.path);
  }
}

function renderCategories() {
  const categories = [...new Set(state.books.map(b => b.category).filter(Boolean))];
  el("categories").replaceChildren(...["", ...categories].map(category => {
    const button = node("button", category || "全部");
    button.setAttribute("aria-pressed", String(category === state.category));
    button.addEventListener("click", () => {
      state.category = category;
      for (const sibling of el("categories").children) sibling.setAttribute("aria-pressed", String(sibling === button));
      renderBooks();
    });
    return button;
  }));
}
function cover(book, index) {
  const theme = colors.includes(book.color) ? book.color : colors[index % colors.length];
  const box = node("span", "", "cover " + theme);
  box.setAttribute("aria-hidden", "true");
  box.append(node("b", book.title.split(/[：:]/)[0]));
  if (/^https?:\/\//i.test(book.coverUrl || "")) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove(), {once:true});
    img.src = book.coverUrl;
    box.append(img);
  }
  return box;
}
function filtered() {
  const q = normalize(el("query").value);
  const books = state.books.filter(b =>
    (!state.category || b.category === state.category) && (!el("pdf-only").checked || b.files.length) &&
    (!q || [b.title, b.author, b.category, b.review, b.quote, ...b.files.map(f => f.filename)].some(v => normalize(v).includes(q)))
  );
  const sort = el("sort").value;
  if (sort === "title") books.sort((a,b) => collate.compare(a.title, b.title));
  if (sort === "date") books.sort((a,b) => (b.date || "").localeCompare(a.date || ""));
  if (sort === "rating") books.sort((a,b) => Number(b.rating || 0) - Number(a.rating || 0));
  return books;
}
function renderBooks() {
  const books = filtered();
  el("count").textContent = books.length + " 本";
  el("empty").hidden = books.length > 0;
  el("books").classList.toggle("list", state.list);
  el("books").replaceChildren(...books.map((book, index) => {
    const button = node("button", "", "card");
    const meta = node("span", "", "meta");
    meta.append(node("small", book.category || "未分类"), node("span", book.title, "name"),
      node("span", book.author || "作者未标注", "by"), node("span", book.files.length ? "阅读 PDF ↗" : "查看笔记 →", "format" + (book.files.length ? " ready" : "")));
    button.append(cover(book, index), meta);
    button.addEventListener("click", () => showBook(book));
    return button;
  }));
}
function showBook(book) {
  el("detail-title").textContent = book.title;
  el("detail-cat").textContent = book.category || "未分类";
  el("detail-by").textContent = [book.author, book.date && ("读于 " + book.date), book.rating && ("推荐 " + book.rating + "/5")].filter(Boolean).join(" · ");
  el("quote-section").hidden = !book.quote;
  el("quote").textContent = book.quote || "";
  el("note-section").hidden = !book.review;
  el("note").textContent = book.review || "";
  el("files").replaceChildren(...book.files.map(file => {
    const row = node("div", "", "actions");
    const read = node("a", book.files.length > 1 ? file.filename + " ↗" : "在线阅读 PDF ↗", "primary");
    read.href = file.url;
    read.target = "_blank";
    read.rel = "noopener";
    const download = node("a", "下载 PDF", "secondary");
    download.href = file.url;
    download.download = file.filename;
    row.append(read, download);
    return row;
  }));
  el("details").showModal();
}
function reset() {
  state.category = "";
  el("query").value = "";
  el("pdf-only").checked = false;
  renderCategories();
  renderBooks();
}
el("close").addEventListener("click", () => el("details").close());
el("details").addEventListener("click", event => {
  if (event.target === el("details")) el("details").close();
});
el("reset").addEventListener("click", reset);
el("query").addEventListener("input", renderBooks);
el("pdf-only").addEventListener("change", renderBooks);
el("sort").addEventListener("change", renderBooks);
el("view").addEventListener("click", () => {
  state.list = !state.list;
  el("view").setAttribute("aria-pressed", String(state.list));
  el("view").textContent = state.list ? "卡片视图" : "列表视图";
  renderBooks();
});
el("excerpt-source").addEventListener("click", () => showBook(state.feature));
async function start() {
  const [catalog, files] = await Promise.allSettled([json("./catalog.json"), pdfPaths()]);
  const hasCatalog = catalog.status === "fulfilled" && Array.isArray(catalog.value);
  const hasFiles = files.status === "fulfilled";
  state.books = buildCatalog(hasCatalog ? catalog.value : [], hasFiles ? files.value : []);
  state.feature = state.books.find(b => b.quote);
  if (state.feature) {
    el("excerpt-text").textContent = state.feature.quote;
    el("excerpt-source").textContent = "《" + state.feature.title + "》 →";
    el("excerpt").hidden = false;
  }
  el("status").hidden = hasCatalog && hasFiles;
  el("status").textContent = [!hasCatalog && "书目暂时加载失败。", !hasFiles && "PDF 索引暂时加载失败。"].filter(Boolean).join("") + "请稍后刷新重试。";
  renderCategories();
  renderBooks();
  if (!hasCatalog && !hasFiles) el("empty").hidden = true;
}
start();
