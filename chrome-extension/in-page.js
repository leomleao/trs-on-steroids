if (window.__trsOnSteroidsInitialized) {
	console.debug("TRS on Steroids already initialized in this frame, skipping bootstrap.");
} else {
	window.__trsOnSteroidsInitialized = true;
	console.log("in-page.js loaded");

	const sharedWindow = getSharedWindow();
	sharedWindow.ticketData = sharedWindow.ticketData || createEmptyTicketData();

	const DEFAULT_TEMPLATE_LABELS = {
		template1: "3rd Strike",
		template2: "2nd Strike",
		template3: "Closure"
	};
	const TEMPLATE_STORAGE_KEY = "userTemplates";
	const COMMENT_DRAFT_STORAGE_PREFIX = "commentDraft:";
	const COMMENT_DRAFT_SAVE_DELAY_MS = 500;
	const TEMPLATE_PLACEHOLDER_KEYS = Object.freeze(Object.keys(createEmptyTicketData()));
	const TEMPLATE_EXPRESSION_KEYS = Object.freeze(["todayPlusDays(3)"]);
	const TEMPLATE_MANAGER_OVERLAY_ID = "trs-template-manager-overlay";


// ------------------------------------------
// Utility: wait for an element to appear
// ------------------------------------------
function waitForElement(selector, root = document) {
	return new Promise(resolve => {
		const existing = root.querySelector(selector);
		if (existing) return resolve(existing);

		const observer = new MutationObserver(() => {
			const found = root.querySelector(selector);
			if (found) {
				observer.disconnect();
				resolve(found);
			}
		});

		observer.observe(root, { childList: true, subtree: true });
	});
}


function getSharedWindow() {
	try {
		return window.top || window;
	} catch (error) {
		return window;
	}
}

function getTicketData() {
	const sharedWindow = getSharedWindow();
	sharedWindow.ticketData = sharedWindow.ticketData || createEmptyTicketData();
	return sharedWindow.ticketData;
}

function createEmptyTicketData() {
	return {
		personName: "",
		lastComment: "",
		lastCommentDate: "",
		previousToLastCommentDate: "",
		nextContactDate: "",
		totalTimeCON: 0,
		totalTimeCUS: 0,
		totalTicketTime: 0,
		status: "",
		title: "",
		priority: "",
		entryType: "",
		owner: "",
		assignedTo: "",
		loggedBy: "",
		loggedDate: "",
		externalId: "",
		deliveryDate: "",
		details: "",
		comments: []
	};
}

function createEmptyTemplateStore() {
	return {
		defaultTemplates: [],
		userTemplates: [],
		listeners: new Set(),
		initPromise: null,
		storageListenerBound: false
	};
}

function getTemplateStore() {
	const shared = getSharedWindow();
	shared.templateStore = shared.templateStore || createEmptyTemplateStore();
	return shared.templateStore;
}

function buildTemplateMarkup(template, source = "user") {
	if (!template) return null;

	if (typeof template === "string") {
		return {
			id: "",
			label: "",
			content: template,
			source
		};
	}

	if (typeof template !== "object") return null;

	return {
		id: String(template.id || ""),
		label: String(template.label || "").trim(),
		content: String(template.content || ""),
		source: template.source || source
	};
}

function normalizeTemplateEntry(entry, fallbackId, source = "user") {
	const normalized = buildTemplateMarkup(entry, source);
	if (!normalized) return null;

	normalized.id = normalized.id || fallbackId || "";
	normalized.label = normalized.label || DEFAULT_TEMPLATE_LABELS[normalized.id] || normalized.id || "Untitled Template";
	normalized.content = normalized.content.trim();
	normalized.source = source;

	return normalized.id && normalized.content ? normalized : null;
}

function normalizeStoredTemplates(entries) {
	if (!Array.isArray(entries)) return [];

	return entries
		.map((entry, index) => normalizeTemplateEntry(entry, `user-template-${index + 1}`, "user"))
		.filter(Boolean);
}

function getAllTemplates() {
	const templateStore = getTemplateStore();
	return [...templateStore.defaultTemplates, ...templateStore.userTemplates];
}

function getUserTemplates() {
	return [...getTemplateStore().userTemplates];
}

function getTemplateById(templateId) {
	return getAllTemplates().find(template => template.id === templateId) || null;
}

function notifyTemplateSubscribers() {
	for (const listener of getTemplateStore().listeners) {
		try {
			listener(getAllTemplates());
		} catch (error) {
			console.error("Template subscriber failed", error);
		}
	}
}

function subscribeToTemplates(listener) {
	const templateStore = getTemplateStore();
	templateStore.listeners.add(listener);
	return () => templateStore.listeners.delete(listener);
}

function syncGet(keys) {
	return new Promise((resolve, reject) => {
		if (!chrome?.storage?.sync) {
			resolve({});
			return;
		}

		chrome.storage.sync.get(keys, items => {
			if (chrome.runtime?.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}

			resolve(items || {});
		});
	});
}

function syncSet(items) {
	return new Promise((resolve, reject) => {
		if (!chrome?.storage?.sync) {
			resolve();
			return;
		}

		chrome.storage.sync.set(items, () => {
			if (chrome.runtime?.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}

			resolve();
		});
	});
}

function syncRemove(keys) {
	return new Promise((resolve, reject) => {
		if (!chrome?.storage?.sync) {
			resolve();
			return;
		}

		chrome.storage.sync.remove(keys, () => {
			if (chrome.runtime?.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}

			resolve();
		});
	});
}

async function loadDefaultTemplates() {
	const url = chrome.runtime.getURL("templates.json");
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);

	const rawTemplates = await response.json();

	return Object.entries(rawTemplates)
		.map(([templateId, templateContent]) => normalizeTemplateEntry(templateContent, templateId, "default"))
		.filter(Boolean);
}

function bindTemplateStorageListener() {
	const templateStore = getTemplateStore();
	if (templateStore.storageListenerBound || !chrome?.storage?.onChanged) return;

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "sync" || !changes[TEMPLATE_STORAGE_KEY]) return;

		templateStore.userTemplates = normalizeStoredTemplates(changes[TEMPLATE_STORAGE_KEY].newValue);
		notifyTemplateSubscribers();
	});

	templateStore.storageListenerBound = true;
}

async function initializeTemplates() {
	const templateStore = getTemplateStore();
	if (templateStore.initPromise) return templateStore.initPromise;

	templateStore.initPromise = (async () => {
		const [defaultTemplates, storedItems] = await Promise.all([
			loadDefaultTemplates(),
			syncGet([TEMPLATE_STORAGE_KEY])
		]);

		templateStore.defaultTemplates = defaultTemplates;
		templateStore.userTemplates = normalizeStoredTemplates(storedItems[TEMPLATE_STORAGE_KEY]);
		bindTemplateStorageListener();
		notifyTemplateSubscribers();
		return getAllTemplates();
	})();

	try {
		return await templateStore.initPromise;
	} catch (error) {
		templateStore.initPromise = null;
		throw error;
	}
}

function slugifyTemplateLabel(label) {
	return String(label || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

function createUserTemplateId(label) {
	const slug = slugifyTemplateLabel(label) || "template";
	return `user-${slug}-${Date.now()}`;
}

async function saveUserTemplates(nextTemplates) {
	const normalizedTemplates = normalizeStoredTemplates(nextTemplates);
	await syncSet({ [TEMPLATE_STORAGE_KEY]: normalizedTemplates });

	const templateStore = getTemplateStore();
	templateStore.userTemplates = normalizedTemplates;
	notifyTemplateSubscribers();
}

function insertTextAtCursor(field, text) {
	const start = field.selectionStart ?? field.value.length;
	const end = field.selectionEnd ?? field.value.length;
	const value = field.value;

	field.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
	field.focus();
	field.setSelectionRange(start + text.length, start + text.length);
}

function createEmptyCommentTemplateUiStore() {
	return {
		editorStates: new WeakMap(),
		toolbarBindings: new WeakMap(),
		stylesInjected: false
	};
}

function getCommentTemplateUiStore() {
	const shared = getSharedWindow();
	shared.commentTemplateUiStore = shared.commentTemplateUiStore || createEmptyCommentTemplateUiStore();
	return shared.commentTemplateUiStore;
}

function createEmptyCommentTemplateUiState() {
	return {
		originalContent: null,
		appliedTemplateId: "",
		appliedContent: "",
		cleanTemplateApplied: false,
		lastSelectionRange: null
	};
}

function getCommentTemplateUiState(editorBody) {
	const store = getCommentTemplateUiStore();
	let state = store.editorStates.get(editorBody);
	if (!state) {
		state = createEmptyCommentTemplateUiState();
		store.editorStates.set(editorBody, state);
	}

	return state;
}

function createEmptyCommentDraftStore() {
	return {
		editorStates: new WeakMap(),
		submitBindings: new WeakSet()
	};
}

function getCommentDraftStore() {
	const shared = getSharedWindow();
	shared.commentDraftStore = shared.commentDraftStore || createEmptyCommentDraftStore();
	return shared.commentDraftStore;
}

function createEmptyCommentDraftState() {
	return {
		ticketId: "",
		listenersBound: false,
		restoreAttempted: false,
		restoreInProgress: false,
		lastSavedHtml: "",
		saveTimerId: 0,
		bodyObserver: null,
		toolbarObserver: null
	};
}

function getCommentDraftState(editorBody) {
	const store = getCommentDraftStore();
	let state = store.editorStates.get(editorBody);
	if (!state) {
		state = createEmptyCommentDraftState();
		store.editorStates.set(editorBody, state);
	}

	return state;
}

function getCommentDraftStorageKey(ticketId) {
	const normalizedId = String(ticketId || "").trim();
	return normalizedId ? `${COMMENT_DRAFT_STORAGE_PREFIX}${normalizedId}` : "";
}

function hasMeaningfulEditorContent(html) {
	return Boolean(normalizeRichText(html || ""));
}

async function loadCommentDraft(ticketId) {
	const storageKey = getCommentDraftStorageKey(ticketId);
	if (!storageKey) return "";

	const items = await syncGet([storageKey]);
	return typeof items[storageKey] === "string" ? items[storageKey] : "";
}

async function saveCommentDraft(ticketId, html) {
	const storageKey = getCommentDraftStorageKey(ticketId);
	if (!storageKey) return;

	await syncSet({ [storageKey]: html });
}

async function clearCommentDraft(ticketId) {
	const storageKey = getCommentDraftStorageKey(ticketId);
	if (!storageKey) return;

	await syncRemove([storageKey]);
}


function saveEditorSelection(editorBody) {
	const doc = editorBody.ownerDocument;
	const selection = doc.getSelection ? doc.getSelection() : doc.defaultView?.getSelection?.();
	if (!selection || selection.rangeCount === 0) return;

	const range = selection.getRangeAt(0);
	if (!editorBody.contains(range.commonAncestorContainer)) return;

	getCommentTemplateUiState(editorBody).lastSelectionRange = range.cloneRange();
}


function createTemplatePlaceholderButton(token, targetOrCallback) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "ui-button ui-corner-all ui-widget";
	button.style.cssText = "font:11px Tahoma,Arial,sans-serif;padding:.15em .4em;margin:0;";
	button.textContent = `{{ ${token} }}`;

	const previewValue = getTicketData()?.[token];
	if (previewValue !== undefined) {
		button.title = previewValue ? String(previewValue) : "No current value on this ticket";
	}

	button.addEventListener("click", () => {
		if (typeof targetOrCallback === "function") {
			targetOrCallback(`{{ ${token} }}`);
		} else {
			insertTextAtCursor(targetOrCallback, `{{ ${token} }}`);
		}
	});

	return button;
}

function closeTemplateManager() {
	const overlay = document.getElementById(TEMPLATE_MANAGER_OVERLAY_ID);
	if (!overlay) return;

	overlay.__unsubscribeTemplates?.();
	overlay.remove();
}

function openTemplateManager() {
	const existingOverlay = document.getElementById(TEMPLATE_MANAGER_OVERLAY_ID);
	if (existingOverlay) {
		existingOverlay.style.display = "flex";
		return;
	}

	const overlay = document.createElement("div");
	overlay.id = TEMPLATE_MANAGER_OVERLAY_ID;
	overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2147483647;";

	const modal = document.createElement("div");
	modal.style.cssText = "width:min(820px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#fff;border:1px solid rgb(197,197,197);border-radius:3px;font:11px Tahoma,Arial,sans-serif;color:rgb(51,51,51);overflow:hidden;";
	modal.addEventListener("click", event => event.stopPropagation());

	// Title bar
	const titlebar = document.createElement("div");
	titlebar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:4px 11px;background:rgb(233,233,233);border-bottom:1px solid rgb(221,221,221);border-radius:3px 3px 0 0;flex-shrink:0;";

	const titleSpan = document.createElement("span");
	titleSpan.textContent = "Manage Templates";
	titleSpan.style.cssText = "font:700 11px Tahoma,Arial,sans-serif;";

	const titleCloseButton = document.createElement("button");
	titleCloseButton.type = "button";
	titleCloseButton.className = "ui-button ui-corner-all ui-widget ui-button-icon-only ui-dialog-titlebar-close";
	titleCloseButton.title = "Close";
	titleCloseButton.innerHTML = `<span class="ui-button-icon ui-icon ui-icon-closethick"></span><span class="ui-button-icon-space"> </span>Close`;

	titlebar.appendChild(titleSpan);
	titlebar.appendChild(titleCloseButton);

	// Content
	const content = document.createElement("div");
	content.style.cssText = "padding:8px 11px;overflow:auto;flex:1;";

	const layout = document.createElement("div");
	layout.style.cssText = "display:grid;grid-template-columns:minmax(180px,220px) minmax(0,1fr);gap:12px;";

	const listPanel = document.createElement("div");
	const listLabel = document.createElement("label");
	listLabel.textContent = "Your Templates";
	listLabel.style.cssText = "display:block;font-weight:700;margin-bottom:4px;";

	const templateList = document.createElement("select");
	templateList.size = 10;
	templateList.style.cssText = "width:100%;min-height:220px;padding:4px;font:11px Tahoma,Arial,sans-serif;";
	templateList.className = "ui-widget ui-widget-content ui-corner-all";

	const listHint = document.createElement("p");
	listHint.textContent = "Built-in templates are read-only; this editor manages your custom ones.";
	listHint.style.cssText = "margin:4px 0 0;color:rgb(100,100,100);";

	listPanel.appendChild(listLabel);
	listPanel.appendChild(templateList);
	listPanel.appendChild(listHint);

	const editorPanel = document.createElement("div");

	const nameLabel = document.createElement("label");
	nameLabel.textContent = "Template Name";
	nameLabel.style.cssText = "display:block;font-weight:700;margin-bottom:3px;";

	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.placeholder = "Example: Awaiting Customer Update";
	nameInput.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;padding:4px 6px;font:11px Tahoma,Arial,sans-serif;border:1px solid rgb(197,197,197);border-radius:3px;";

	const contentLabel = document.createElement("label");
	contentLabel.textContent = "Template Content";
	contentLabel.style.cssText = "display:block;font-weight:700;margin-bottom:3px;";

	// contenteditable div — renders HTML and converts user line breaks to <br>/<p>
	const contentDiv = document.createElement("div");
	contentDiv.contentEditable = "true";
	contentDiv.style.cssText = "width:100%;min-height:180px;box-sizing:border-box;padding:4px 6px;margin-bottom:8px;overflow:auto;font:11px Tahoma,Arial,sans-serif;border:1px solid rgb(197,197,197);border-radius:3px;background:#fff;";

	// Hidden textarea used as TinyMCE target (only when TinyMCE is available)
	const contentInput = document.createElement("textarea");
	contentInput.id = "trs-template-content-editor";
	contentInput.style.display = "none";

	let tinyEditor = null;
	let savedSelection = null;

	function getEditorContent() {
		return tinyEditor ? tinyEditor.getContent() : contentDiv.innerHTML;
	}

	function setEditorContent(html) {
		if (tinyEditor) {
			tinyEditor.setContent(html);
		} else {
			contentDiv.innerHTML = html;
		}
	}

	function insertEditorToken(token) {
		if (tinyEditor) {
			tinyEditor.insertContent(token);
			tinyEditor.focus();
			return;
		}
		contentDiv.focus();
		if (savedSelection) {
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(savedSelection);
		}
		document.execCommand("insertText", false, token);
	}

	contentDiv.addEventListener("blur", () => {
		const sel = window.getSelection();
		savedSelection = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
	});

	// Prevent jQuery UI dialog from swallowing keyboard input in the editor
	contentDiv.addEventListener("keydown", (e) => e.stopPropagation());
	contentDiv.addEventListener("keypress", (e) => e.stopPropagation());

	const tinymce = getTinyMceGlobal();
	if (tinymce) {
		contentDiv.style.display = "none";
		contentInput.style.display = "";
		Promise.resolve().then(() => {
			tinymce.init({
				target: contentInput,
				height: 200,
				menubar: false,
				toolbar: "bold italic underline | bullist numlist | removeformat",
				plugins: "lists",
				setup(editor) {
					tinyEditor = editor;
					editor.on("init", () => {
						if (contentInput._pendingContent !== undefined) {
							editor.setContent(contentInput._pendingContent);
							delete contentInput._pendingContent;
						}
					});
				}
			});
		});
	}

	const placeholderLabel = document.createElement("div");
	placeholderLabel.textContent = "Insert placeholders from ticketData";
	placeholderLabel.style.cssText = "font-weight:700;margin-bottom:4px;";

	const placeholderGrid = document.createElement("div");
	placeholderGrid.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;";

	for (const placeholderKey of TEMPLATE_PLACEHOLDER_KEYS) {
		placeholderGrid.appendChild(createTemplatePlaceholderButton(placeholderKey, insertEditorToken));
	}

	for (const expressionKey of TEMPLATE_EXPRESSION_KEYS) {
		placeholderGrid.appendChild(createTemplatePlaceholderButton(expressionKey, insertEditorToken));
	}

	const helperText = document.createElement("p");
	helperText.textContent = "Placeholders matching ticketData are filled when the template is applied.";
	helperText.style.cssText = "margin:0;color:rgb(100,100,100);";

	editorPanel.appendChild(nameLabel);
	editorPanel.appendChild(nameInput);
	editorPanel.appendChild(contentLabel);
	editorPanel.appendChild(contentDiv);
	editorPanel.appendChild(contentInput);
	editorPanel.appendChild(placeholderLabel);
	editorPanel.appendChild(placeholderGrid);
	editorPanel.appendChild(helperText);

	layout.appendChild(listPanel);
	layout.appendChild(editorPanel);
	content.appendChild(layout);

	// Button pane
	const buttonpane = document.createElement("div");
	buttonpane.style.cssText = "display:flex;align-items:center;gap:6px;padding:5px 11px 6px;border-top:1px solid rgb(221,221,221);background:#fff;flex-shrink:0;";

	const newButton = document.createElement("button");
	newButton.type = "button";
	newButton.className = "ui-button ui-corner-all ui-widget";
	newButton.textContent = "New";

	const saveButton = document.createElement("button");
	saveButton.type = "button";
	saveButton.className = "ui-button ui-corner-all ui-widget";
	saveButton.textContent = "Save";

	const deleteButton = document.createElement("button");
	deleteButton.type = "button";
	deleteButton.className = "ui-button ui-corner-all ui-widget";
	deleteButton.textContent = "Delete";

	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.className = "ui-button ui-corner-all ui-widget";
	closeButton.textContent = "Close";

	const status = document.createElement("span");
	status.style.cssText = "margin-left:4px;color:rgb(51,102,51);";

	buttonpane.appendChild(newButton);
	buttonpane.appendChild(saveButton);
	buttonpane.appendChild(deleteButton);
	buttonpane.appendChild(closeButton);
	buttonpane.appendChild(status);

	modal.appendChild(titlebar);
	modal.appendChild(content);
	modal.appendChild(buttonpane);
	overlay.appendChild(modal);

	const container = document.querySelector("#divEditHDEntryComment_IO")?.closest(".ui-dialog") ?? document.body;
	container.appendChild(overlay);

	let currentTemplateId = "";

	function setStatus(message, isError = false) {
		status.textContent = message;
		status.style.color = isError ? "#b91c1c" : "#0f766e";
	}

	function resetForm() {
		currentTemplateId = "";
		templateList.value = "";
		nameInput.value = "";
		setEditorContent("");
		deleteButton.disabled = true;
	}

	function loadIntoForm(templateId) {
		const template = getUserTemplates().find(entry => entry.id === templateId);
		if (!template) {
			resetForm();
			return;
		}

		currentTemplateId = template.id;
		templateList.value = template.id;
		nameInput.value = template.label;
		if (tinyEditor) {
			tinyEditor.setContent(template.content);
		} else {
			contentInput._pendingContent = template.content;
			contentDiv.innerHTML = template.content;
		}
		deleteButton.disabled = false;
	}

	function renderTemplateList() {
		const templates = getUserTemplates();
		const previouslySelected = currentTemplateId;

		templateList.replaceChildren();

		for (const template of templates) {
			const option = document.createElement("option");
			option.value = template.id;
			option.textContent = template.label;
			templateList.appendChild(option);
		}

		if (previouslySelected && templates.some(template => template.id === previouslySelected)) {
			loadIntoForm(previouslySelected);
			return;
		}

		if (!templates.length) {
			resetForm();
		}
	}

	templateList.addEventListener("change", () => {
		setStatus("");
		loadIntoForm(templateList.value);
	});

	newButton.addEventListener("click", () => {
		setStatus("");
		resetForm();
		nameInput.focus();
	});

	saveButton.addEventListener("click", async () => {
		const label = nameInput.value.trim();
		const content = getEditorContent().trim();

		if (!label) {
			setStatus("Template name is required.", true);
			nameInput.focus();
			return;
		}

		if (!content) {
			setStatus("Template content is required.", true);
			if (tinyEditor) tinyEditor.focus(); else contentDiv.focus();
			return;
		}

		const nextTemplate = {
			id: currentTemplateId || createUserTemplateId(label),
			label,
			content
		};

		const templates = getUserTemplates();
		const existingIndex = templates.findIndex(template => template.id === nextTemplate.id);

		if (existingIndex >= 0) {
			templates[existingIndex] = nextTemplate;
		} else {
			templates.push(nextTemplate);
		}

		try {
			await saveUserTemplates(templates);
			currentTemplateId = nextTemplate.id;
			renderTemplateList();
			setStatus("Template saved to sync storage.");
		} catch (error) {
			console.error("Could not save template", error);
			setStatus("Could not save template.", true);
		}
	});

	deleteButton.addEventListener("click", async () => {
		if (!currentTemplateId) return;

		try {
			const templates = getUserTemplates().filter(template => template.id !== currentTemplateId);
			await saveUserTemplates(templates);
			resetForm();
			renderTemplateList();
			setStatus("Template deleted.");
		} catch (error) {
			console.error("Could not delete template", error);
			setStatus("Could not delete template.", true);
		}
	});

	function closeAndCleanup() {
		tinyEditor?.remove();
		tinyEditor = null;
		closeTemplateManager();
	}

	closeButton.addEventListener("click", closeAndCleanup);
	titleCloseButton.addEventListener("click", closeAndCleanup);
	overlay.addEventListener("click", closeAndCleanup);

	overlay.__unsubscribeTemplates = subscribeToTemplates(renderTemplateList);

	renderTemplateList();
	resetForm();
}

function getInputValue(root, selector) {
	const element = root.querySelector(selector);
	return element?.value?.trim() || "";
}

function getTextContent(root, selector) {
	const element = root.querySelector(selector);
	return element?.textContent?.trim() || "";
}

function getNumericValue(root, selector) {
	const rawValue = getTextContent(root, selector) || getInputValue(root, selector);
	const parsed = Number(rawValue);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getSelectedText(root, selector) {
	const element = root.querySelector(selector);
	if (!element) return "";

	const selectedOption = element.selectedOptions?.[0];
	return selectedOption?.textContent?.trim() || "";
}

function getOverviewFieldValue(root, label) {
	const overview = root.querySelector("#tblHDID");
	if (!overview) return "";

	const lines = overview.innerText
		.split(/\n+/)
		.map(line => line.trim())
		.filter(Boolean);

	const labelIndex = lines.indexOf(`${label}:`);
	return labelIndex >= 0 ? lines[labelIndex + 1] || "" : "";
}

function normalizeRichText(html) {
	return html
		.replace(/<p>/gi, "")
		.replace(/<\/p>/gi, "\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/&nbsp;/gi, " ")
		.replace(/<[^>]+>/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function getTinyMceGlobal() {
	if (window.tinymce) return window.tinymce;
	const tinyFrame = findElement("#txt_ed_comment_ifr");
	if (tinyFrame) {
		const parentWin = tinyFrame.ownerDocument?.defaultView;
		if (parentWin?.tinymce) return parentWin.tinymce;
	}
	return null;
}

function getTinyMceBody(root, dataId) {
	const iframes = root.querySelectorAll("iframe");

	for (const frame of iframes) {
		try {
			const frameDoc = frame.contentDocument || frame.contentWindow?.document;
			const body = frameDoc?.querySelector(`body#tinymce[data-id="${dataId}"]`);
			if (body) return body;
		} catch (error) {
		}
	}

	return null;
}

function getTinyMceText(root, dataId) {
	const body = getTinyMceBody(root, dataId);
	if (!body) return "";

	return normalizeRichText(body.innerHTML);
}

async function waitForTinyMceText(root, dataId, timeoutMs = 10000, intervalMs = 250) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const text = getTinyMceText(root, dataId);
		if (text) return text;

		await new Promise(resolve => setTimeout(resolve, intervalMs));
	}

	return "";
}

function parseUkDate(value) {
	if (!value) return null;

	const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (!match) return null;

	const [, day, month, year, hours = "0", minutes = "0", seconds = "0"] = match;
	const parsed = new Date(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hours),
		Number(minutes),
		Number(seconds)
	);

	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDaysInPast(value) {
	const parsedDate = value instanceof Date ? value : parseUkDate(value);
	if (!parsedDate) return null;

	const today = new Date();
	const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const normalizedDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
	const differenceMs = normalizedToday - normalizedDate;

	if (differenceMs <= 0) {
		return 0;
	}

	return Math.floor(differenceMs / 86400000);
}

function normalizeText(value) {
	return (value || "").trim().toLowerCase();
}

function isPlaceholderAssignment(value) {
	const normalizedValue = normalizeText(value);
	return !normalizedValue || normalizedValue === "-- select --" || normalizedValue === "select" || normalizedValue === "unassigned";
}

function buildTicketWarnings(ticketData, lastCustomerFacingCommentDate) {
	const warnings = [];
	const normalizedStatus = normalizeText(ticketData.status);
	const normalizedPriority = normalizeText(ticketData.priority);
	const normalizedEntryType = normalizeText(ticketData.entryType);
	const hidesDeliveryDateWarningStatuses = new Set([
		"customer uat",
		"provided to customer",
		"accepted"
	]);
	const isClosedTicket = normalizedStatus === "close" || normalizedStatus === "closed";

	if (isClosedTicket) {
		if (ticketData.totalTimeCON > ticketData.totalTicketTime) {
			const timeOver = ticketData.totalTimeCON - ticketData.totalTicketTime;
			warnings.push(`Time spent is ${timeOver.toFixed(2)} hour${timeOver === 1 ? "" : "s"} over the total ticket time.`);
		}

		return warnings;
	}

	if (!ticketData.nextContactDate) {
		warnings.push("The next contact date is missing.");
	}

	const nextContactDaysPast = getDaysInPast(ticketData.nextContactDate);
	if (nextContactDaysPast > 0) {
		warnings.push(`The next contact date is ${nextContactDaysPast} day${nextContactDaysPast === 1 ? "" : "s"} in the past.`);
	}

	if (normalizedEntryType === "change request" && !ticketData.deliveryDate) {
		warnings.push("The delivery date is missing for this Change Request.");
	}

	const deliveryDaysPast = getDaysInPast(ticketData.deliveryDate);
	if (deliveryDaysPast > 0 && !hidesDeliveryDateWarningStatuses.has(normalizedStatus)) {
		warnings.push(`The delivery date is ${deliveryDaysPast} day${deliveryDaysPast === 1 ? "" : "s"} in the past.`);
	}

	const lastCommentDaysPast = getDaysInPast(lastCustomerFacingCommentDate);
	if (isPlaceholderAssignment(ticketData.assignedTo)) {
		warnings.push("This ticket is unassigned.");
	}

	if (normalizedPriority && normalizedPriority !== "p4 - low" && lastCommentDaysPast > 3) {
		warnings.push(`This ${ticketData.priority} ${ticketData.entryType} has no customer-facing update for ${lastCommentDaysPast} days.`);
	} else if (lastCommentDaysPast > 7) {
		warnings.push(`The last customer-facing comment is ${lastCommentDaysPast} days old.`);
	}

	if (ticketData.totalTicketTime < 0) {
		const extraTime = Math.abs(ticketData.totalTicketTime);
		warnings.push(`This ticket is ${extraTime.toFixed(2)} extra hour${extraTime === 1 ? "" : "s"}.`);
	} else if (ticketData.totalTimeCON > ticketData.totalTicketTime) {
		const timeOver = ticketData.totalTimeCON - ticketData.totalTicketTime;
		warnings.push(`Time spent is ${timeOver.toFixed(2)} hour${timeOver === 1 ? "" : "s"} over the total ticket time.`);
	} else {
		const remainingTime = ticketData.totalTicketTime - ticketData.totalTimeCON;
		if (remainingTime === 0) {
			warnings.push("No time left on this ticket.");
		} else if (remainingTime < 1.25) {
			warnings.push(`Only ${remainingTime.toFixed(2)} hour${remainingTime === 1 ? "" : "s"} remain before reaching the quoted time.`);
		}
	}

	return warnings;
}

function renderTicketNotifications(ticketDoc, warnings) {
	const hiddenToolbar = ticketDoc.querySelector('div[style*="visibility:hidden"] #lb_save_general')?.parentElement;
	if (hiddenToolbar) {
		hiddenToolbar.style.display = "none";
	}

	const titlePanel = ticketDoc.querySelector("#pan_ed_title");
	if (!titlePanel) return;

	let notificationPanel = ticketDoc.querySelector("#pan_ed_notification");
	if (!notificationPanel) {
		notificationPanel = ticketDoc.createElement("div");
		notificationPanel.id = "pan_ed_notification";
		notificationPanel.className = "ed_field";
		notificationPanel.style.background = "#fff4e5";
		notificationPanel.style.border = "1px solid #f0b35f";
		notificationPanel.style.borderLeft = "6px solid #d97706";
		notificationPanel.style.borderRadius = "6px";
		notificationPanel.style.padding = "14px 18px";
		notificationPanel.style.margin = "0px 18px 18px 0px";
		notificationPanel.style.color = "#7c2d12";
		titlePanel.insertAdjacentElement("beforebegin", notificationPanel);
	}

	if (!warnings.length) {
		notificationPanel.innerHTML = "";
		notificationPanel.style.display = "none";
		return;
	}

	const warningMarkup = warnings.map(message => `<li>${message}</li>`).join("");
	notificationPanel.style.display = "";
	notificationPanel.innerHTML = `
		<div style="font-size: 16px; font-weight: 700; margin-bottom: 10px;">Warning</div>
		<ul style="margin: 0 0 0 18px; padding: 0; font-size: 14px; line-height: 1.5;">
			${warningMarkup}
		</ul>
	`;
}

function getTicketDocument(root = document) {
	const rootsToSearch = [root, document];

	for (const currentRoot of rootsToSearch) {
		if (!currentRoot?.querySelectorAll) continue;

		const iframes = currentRoot.querySelectorAll('iframe[src*="/helpdesk/edit_popup"]');
		for (const frame of iframes) {
			try {
				const ticketDoc = frame.contentDocument || frame.contentWindow?.document;
				if (ticketDoc) return ticketDoc;
			} catch (error) {
			}
		}
	}

	return null;
}

async function waitForTicketDocumentReady(root = document, timeoutMs = 10000, intervalMs = 250) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const ticketDoc = getTicketDocument(root);
		if (ticketDoc) {
			const ticketTable = ticketDoc.querySelector("#tblHDID");
			const comments = ticketDoc.querySelector("#udp_Comments");

			if (ticketTable && comments) {
				return ticketDoc;
			}
		}

		await new Promise(resolve => setTimeout(resolve, intervalMs));
	}

	return null;
}

function getCurrentTicketSignature(root = document) {
	const ticketDoc = getTicketDocument(root);
	if (!ticketDoc) return "";

	const ticketId = getOverviewFieldValue(ticketDoc, "ID");
	const title = getInputValue(ticketDoc, "#txt_ed_title");
	const deliveryDate = getInputValue(ticketDoc, "#txt_ed_solution_del_date");

	return [ticketId, title, deliveryDate].join("|");
}

function watchTicketFrameChanges(root = document) {
	if (root.__trsTicketWatcherStarted) {
		return;
	}
	root.__trsTicketWatcherStarted = true;

	let lastTicketFrameSrc = "";
	let lastTicketSignature = "";
	let refreshInFlight = false;

	const triggerRefresh = async () => {
		if (refreshInFlight) return;

		refreshInFlight = true;
		try {
			await refreshTicketData(root);
		} finally {
			refreshInFlight = false;
		}
	};

	const checkTicketSignature = () => {
		const currentSignature = getCurrentTicketSignature(root);
		if (!currentSignature || currentSignature === lastTicketSignature) {
			return;
		}

		lastTicketSignature = currentSignature;
		triggerRefresh();
	};

	const bindTicketFrame = frame => {
		if (!(frame instanceof HTMLIFrameElement)) return;
		if (!frame.src.includes("/helpdesk/edit_popup")) return;
		if (frame.dataset.trsTicketWatcherBound === "true") return;

		frame.dataset.trsTicketWatcherBound = "true";
		frame.addEventListener("load", () => {
			const currentSrc = frame.getAttribute("src") || "";
			if (currentSrc !== lastTicketFrameSrc) {
				lastTicketFrameSrc = currentSrc;
			}
			triggerRefresh();
			setTimeout(checkTicketSignature, 250);
			setTimeout(checkTicketSignature, 1000);
		});
	};

	const existingFrames = root.querySelectorAll('iframe[src*="/helpdesk/edit_popup"]');
	for (const frame of existingFrames) {
		lastTicketFrameSrc = frame.getAttribute("src") || lastTicketFrameSrc;
		bindTicketFrame(frame);
	}

	const observer = new MutationObserver(mutations => {
		for (const mutation of mutations) {
			if (mutation.type === "attributes" && mutation.target instanceof HTMLIFrameElement) {
				const frame = mutation.target;
				if (!frame.src.includes("/helpdesk/edit_popup")) continue;

				const currentSrc = frame.getAttribute("src") || "";
				if (currentSrc && currentSrc !== lastTicketFrameSrc) {
					lastTicketFrameSrc = currentSrc;
					bindTicketFrame(frame);
					triggerRefresh();
				}
			}

			for (const node of mutation.addedNodes) {
				if (!(node instanceof Element)) continue;

				if (node.matches?.('iframe[src*="/helpdesk/edit_popup"]')) {
					const frame = node;
					lastTicketFrameSrc = frame.getAttribute("src") || lastTicketFrameSrc;
					bindTicketFrame(frame);
					triggerRefresh();
					setTimeout(checkTicketSignature, 250);
					continue;
				}

				const nestedFrames = node.querySelectorAll?.('iframe[src*="/helpdesk/edit_popup"]') || [];
				for (const frame of nestedFrames) {
					lastTicketFrameSrc = frame.getAttribute("src") || lastTicketFrameSrc;
					bindTicketFrame(frame);
					triggerRefresh();
					setTimeout(checkTicketSignature, 250);
				}
			}
		}
	});

	observer.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["src"]
	});

	checkTicketSignature();
	root.__trsTicketSignatureInterval = window.setInterval(checkTicketSignature, 1000);
}

/**
 * Get the latest customer-facing comment (context === "Customer facing")
 * @param {Array} comments - Array of comment objects, latest first
 * @returns {Object|null} - The comment object, or null if none found
 */
function getLastCustomerFacingComment(comments) {
	for (const comment of comments) {
		if (comment.context === "Customer facing") {
			return comment;
		}
	}
	return null;
}

/**
 * Get the comment before the latest customer-facing comment
 * @param {Array} comments - Array of comment objects, latest first
 * @returns {Object|null} - The comment object, or null if none found
 */
function getPreviousToLastCustomerFacingComment(comments) {
	let foundLatest = false;

	for (const comment of comments) {
		if (comment.context === "Customer facing") {
			if (!foundLatest) {
				// First customer-facing comment → mark as found
				foundLatest = true;
			} else {
				// Second customer-facing comment → return it
				return comment;
			}
		}
	}
	return null;
}


// ------------------------------------------
// Utility: prepareCommentsForSummarizer
// ------------------------------------------
function prepareCommentsForSummarizer(comments) {
	return comments.map((c, index) => {
		const dateStr = c.date ? new Date(c.date).toLocaleString('en-GB', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}) : "Unknown date";

		return `Comment ${index + 1} (${c.context}) by ${c.commentBy} on ${dateStr}:\n${c.content}\n`;
	}).join("\n---\n");
}

// ------------------------------------------
// Utility: template filler
// ------------------------------------------
function fillTemplate(template, data = {}) {
	return template.replace(/{{\s*([^}]+)\s*}}/g, (match, key) => {
		key = key.trim();

		// Handle function calls such as todayPlusDays(3)
		const functionCall = key.match(/^(\w+)\((.*?)\)$/);
		if (functionCall) {
			const funcName = functionCall[1];
			const arg = functionCall[2];

			if (funcName === "todayPlusDays") {
				const days = parseInt(arg);
				const d = new Date();
				d.setDate(d.getDate() + days);
				return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
			}
		}

		// Normal variable replacement
		if (key in data) {
			let value = data[key];

			// Special handling for personName
			if (key === "personName" && typeof value === "string") {
				const emailMatch = value.match(/([a-zA-Z0-9._%+-]+@sonoco\.[a-zA-Z]{2,})/);
				if (emailMatch) {
					return `@[${emailMatch[1]}]`;
				}
			}

			return value;
		}

		return match; // fallback if key not found
	});
}

// ------------------------------------------
// Utility: Button factory
// ------------------------------------------

function getCommentEditorBody(showAlert = true) {
	const iframe = findElement("#txt_ed_comment_ifr");
	if (!iframe) return null;

	const doc = iframe.contentDocument || iframe.contentWindow.document;
	if (!doc) return null;

	const tiny = doc.querySelector("#tinymce");
	if (!tiny) {
		if (showAlert) {
			alert("TinyMCE not found.");
		}
		return null;
	}

	return tiny;
}

function getCommentEditorIframe() {
	return findElement("#txt_ed_comment_ifr");
}

function getCommentEditorHostDocument() {
	return getCommentEditorIframe()?.ownerDocument || document;
}

function getCurrentTicketId(root = document) {
	const ticketDoc = getTicketDocument(root) || getTicketDocument(document) || root;
	return getOverviewFieldValue(ticketDoc, "ID").trim();
}

function getCommentEditorHtml(editorBody) {
	return editorBody?.innerHTML || "";
}

function setCommentEditorHtml(editorBody, html) {
	if (!editorBody) return;

	editorBody.innerHTML = html || "";
}

function resetCommentDraftStateForTicket(state, ticketId) {
	if (state.ticketId === ticketId) return;

	if (state.saveTimerId) {
		clearTimeout(state.saveTimerId);
		state.saveTimerId = 0;
	}

	state.ticketId = ticketId;
	state.restoreAttempted = false;
	state.restoreInProgress = false;
	state.lastSavedHtml = "";
}

async function persistCommentDraftForEditor(editorBody) {
	const state = getCommentDraftState(editorBody);
	if (state.restoreInProgress) return;

	const ticketId = state.ticketId || getCurrentTicketId(editorBody.ownerDocument);
	if (!ticketId) return;

	const html = getCommentEditorHtml(editorBody);
	if (!hasMeaningfulEditorContent(html)) {
		if (state.lastSavedHtml) {
			await clearCommentDraft(ticketId);
			state.lastSavedHtml = "";
		}
		return;
	}

	if (html === state.lastSavedHtml) return;

	await saveCommentDraft(ticketId, html);
	state.lastSavedHtml = html;
}

function scheduleCommentDraftSave(editorBody) {
	const state = getCommentDraftState(editorBody);
	if (state.restoreInProgress) return;

	if (state.saveTimerId) {
		clearTimeout(state.saveTimerId);
	}

	state.saveTimerId = window.setTimeout(async () => {
		state.saveTimerId = 0;
		try {
			await persistCommentDraftForEditor(editorBody);
		} catch (error) {
			console.error("Could not persist comment draft", error);
		}
	}, COMMENT_DRAFT_SAVE_DELAY_MS);
}

async function restoreCommentDraftForEditor(editorBody) {
	const state = getCommentDraftState(editorBody);
	if (state.restoreAttempted) return;

	const ticketId = getCurrentTicketId(editorBody.ownerDocument);
	state.ticketId = ticketId;
	state.restoreAttempted = true;

	if (!ticketId) return;

	try {
		const draftHtml = await loadCommentDraft(ticketId);
		state.lastSavedHtml = draftHtml || "";
		if (!draftHtml) return;

		state.restoreInProgress = true;
		setCommentEditorHtml(editorBody, draftHtml);
		saveEditorSelection(editorBody);
	} catch (error) {
		console.error("Could not restore comment draft", error);
	} finally {
		state.restoreInProgress = false;
	}
}

function createEraseDraftToolbarGroup(editorBody) {
	const toolbarDoc = getCommentEditorHostDocument();
	const group = toolbarDoc.createElement("div");
	group.className = "tox-toolbar__group";
	group.dataset.trsEraseDraftGroup = "true";
	group.setAttribute("title", "");
	group.setAttribute("role", "toolbar");
	group.setAttribute("data-alloy-tabstop", "true");
	group.tabIndex = -1;

	const button = toolbarDoc.createElement("button");
	button.type = "button";
	button.className = "tox-tbtn";
	button.setAttribute("aria-label", "Erase draft");
	button.setAttribute("title", "Erase draft");
	button.setAttribute("aria-disabled", "false");
	button.tabIndex = -1;
	button.dataset.trsEraseDraftButton = "true";
	button.innerHTML = `
		<span class="tox-icon tox-tbtn__icon-wrap">
			<svg width="18" height="18" viewBox="0 0 24.00 24.00" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round" stroke="#222f3" stroke-width="0.4800000000000001">
                        <path d="M5.50506 11.4096L6.03539 11.9399L5.50506 11.4096ZM3 14.9522H2.25H3ZM12.5904 18.4949L12.0601 17.9646L12.5904 18.4949ZM9.04776 21V21.75V21ZM11.4096 5.50506L10.8792 4.97473L11.4096 5.50506ZM13.241 17.8444C13.5339 18.1373 14.0088 18.1373 14.3017 17.8444C14.5946 17.5515 14.5946 17.0766 14.3017 16.7837L13.241 17.8444ZM7.21629 9.69832C6.9234 9.40543 6.44852 9.40543 6.15563 9.69832C5.86274 9.99122 5.86274 10.4661 6.15563 10.759L7.21629 9.69832ZM16.073 16.073C16.3659 15.7801 16.3659 15.3053 16.073 15.0124C15.7801 14.7195 15.3053 14.7195 15.0124 15.0124L16.073 16.073ZM18.4676 11.5559C18.1759 11.8499 18.1777 12.3248 18.4718 12.6165C18.7658 12.9083 19.2407 12.9064 19.5324 12.6124L18.4676 11.5559ZM6.03539 11.9399L11.9399 6.03539L10.8792 4.97473L4.97473 10.8792L6.03539 11.9399ZM6.03539 17.9646C5.18538 17.1146 4.60235 16.5293 4.22253 16.0315C3.85592 15.551 3.75 15.2411 3.75 14.9522H2.25C2.25 15.701 2.56159 16.3274 3.03 16.9414C3.48521 17.538 4.1547 18.2052 4.97473 19.0253L6.03539 17.9646ZM4.97473 10.8792C4.1547 11.6993 3.48521 12.3665 3.03 12.9631C2.56159 13.577 2.25 14.2035 2.25 14.9522H3.75C3.75 14.6633 3.85592 14.3535 4.22253 13.873C4.60235 13.3752 5.18538 12.7899 6.03539 11.9399L4.97473 10.8792ZM12.0601 17.9646C11.2101 18.8146 10.6248 19.3977 10.127 19.7775C9.64651 20.1441 9.33665 20.25 9.04776 20.25V21.75C9.79649 21.75 10.423 21.4384 11.0369 20.97C11.6335 20.5148 12.3008 19.8453 13.1208 19.0253L12.0601 17.9646ZM4.97473 19.0253C5.79476 19.8453 6.46201 20.5148 7.05863 20.97C7.67256 21.4384 8.29902 21.75 9.04776 21.75V20.25C8.75886 20.25 8.449 20.1441 7.9685 19.7775C7.47069 19.3977 6.88541 18.8146 6.03539 17.9646L4.97473 19.0253ZM17.9646 6.03539C18.8146 6.88541 19.3977 7.47069 19.7775 7.9685C20.1441 8.449 20.25 8.75886 20.25 9.04776H21.75C21.75 8.29902 21.4384 7.67256 20.97 7.05863C20.5148 6.46201 19.8453 5.79476 19.0253 4.97473L17.9646 6.03539ZM19.0253 4.97473C18.2052 4.1547 17.538 3.48521 16.9414 3.03C16.3274 2.56159 15.701 2.25 14.9522 2.25V3.75C15.2411 3.75 15.551 3.85592 16.0315 4.22253C16.5293 4.60235 17.1146 5.18538 17.9646 6.03539L19.0253 4.97473ZM11.9399 6.03539C12.7899 5.18538 13.3752 4.60235 13.873 4.22253C14.3535 3.85592 14.6633 3.75 14.9522 3.75V2.25C14.2035 2.25 13.577 2.56159 12.9631 3.03C12.3665 3.48521 11.6993 4.1547 10.8792 4.97473L11.9399 6.03539ZM14.3017 16.7837L7.21629 9.69832L6.15563 10.759L13.241 17.8444L14.3017 16.7837ZM15.0124 15.0124L12.0601 17.9646L13.1208 19.0253L16.073 16.073L15.0124 15.0124ZM19.5324 12.6124C20.1932 11.9464 20.7384 11.3759 21.114 10.8404C21.5023 10.2869 21.75 9.71511 21.75 9.04776H20.25C20.25 9.30755 20.1644 9.58207 19.886 9.979C19.5949 10.394 19.1401 10.8781 18.4676 11.5559L19.5324 12.6124Z" fill="#1C274C"></path>
                        <path d="M9 21H21" stroke="#1C274C" stroke-width="1.44" stroke-linecap="round"></path>
                    </g>
                    <g id="SVGRepo_iconCarrier">
                        <path d="M5.50506 11.4096L6.03539 11.9399L5.50506 11.4096ZM3 14.9522H2.25H3ZM12.5904 18.4949L12.0601 17.9646L12.5904 18.4949ZM9.04776 21V21.75V21ZM11.4096 5.50506L10.8792 4.97473L11.4096 5.50506ZM13.241 17.8444C13.5339 18.1373 14.0088 18.1373 14.3017 17.8444C14.5946 17.5515 14.5946 17.0766 14.3017 16.7837L13.241 17.8444ZM7.21629 9.69832C6.9234 9.40543 6.44852 9.40543 6.15563 9.69832C5.86274 9.99122 5.86274 10.4661 6.15563 10.759L7.21629 9.69832ZM16.073 16.073C16.3659 15.7801 16.3659 15.3053 16.073 15.0124C15.7801 14.7195 15.3053 14.7195 15.0124 15.0124L16.073 16.073ZM18.4676 11.5559C18.1759 11.8499 18.1777 12.3248 18.4718 12.6165C18.7658 12.9083 19.2407 12.9064 19.5324 12.6124L18.4676 11.5559ZM6.03539 11.9399L11.9399 6.03539L10.8792 4.97473L4.97473 10.8792L6.03539 11.9399ZM6.03539 17.9646C5.18538 17.1146 4.60235 16.5293 4.22253 16.0315C3.85592 15.551 3.75 15.2411 3.75 14.9522H2.25C2.25 15.701 2.56159 16.3274 3.03 16.9414C3.48521 17.538 4.1547 18.2052 4.97473 19.0253L6.03539 17.9646ZM4.97473 10.8792C4.1547 11.6993 3.48521 12.3665 3.03 12.9631C2.56159 13.577 2.25 14.2035 2.25 14.9522H3.75C3.75 14.6633 3.85592 14.3535 4.22253 13.873C4.60235 13.3752 5.18538 12.7899 6.03539 11.9399L4.97473 10.8792ZM12.0601 17.9646C11.2101 18.8146 10.6248 19.3977 10.127 19.7775C9.64651 20.1441 9.33665 20.25 9.04776 20.25V21.75C9.79649 21.75 10.423 21.4384 11.0369 20.97C11.6335 20.5148 12.3008 19.8453 13.1208 19.0253L12.0601 17.9646ZM4.97473 19.0253C5.79476 19.8453 6.46201 20.5148 7.05863 20.97C7.67256 21.4384 8.29902 21.75 9.04776 21.75V20.25C8.75886 20.25 8.449 20.1441 7.9685 19.7775C7.47069 19.3977 6.88541 18.8146 6.03539 17.9646L4.97473 19.0253ZM17.9646 6.03539C18.8146 6.88541 19.3977 7.47069 19.7775 7.9685C20.1441 8.449 20.25 8.75886 20.25 9.04776H21.75C21.75 8.29902 21.4384 7.67256 20.97 7.05863C20.5148 6.46201 19.8453 5.79476 19.0253 4.97473L17.9646 6.03539ZM19.0253 4.97473C18.2052 4.1547 17.538 3.48521 16.9414 3.03C16.3274 2.56159 15.701 2.25 14.9522 2.25V3.75C15.2411 3.75 15.551 3.85592 16.0315 4.22253C16.5293 4.60235 17.1146 5.18538 17.9646 6.03539L19.0253 4.97473ZM11.9399 6.03539C12.7899 5.18538 13.3752 4.60235 13.873 4.22253C14.3535 3.85592 14.6633 3.75 14.9522 3.75V2.25C14.2035 2.25 13.577 2.56159 12.9631 3.03C12.3665 3.48521 11.6993 4.1547 10.8792 4.97473L11.9399 6.03539ZM14.3017 16.7837L7.21629 9.69832L6.15563 10.759L13.241 17.8444L14.3017 16.7837ZM15.0124 15.0124L12.0601 17.9646L13.1208 19.0253L16.073 16.073L15.0124 15.0124ZM19.5324 12.6124C20.1932 11.9464 20.7384 11.3759 21.114 10.8404C21.5023 10.2869 21.75 9.71511 21.75 9.04776H20.25C20.25 9.30755 20.1644 9.58207 19.886 9.979C19.5949 10.394 19.1401 10.8781 18.4676 11.5559L19.5324 12.6124Z" fill="#1C274C"></path>
                        <path d="M9 21H21" stroke="#1C274C" stroke-width="1.44" stroke-linecap="round"></path>
                    </g>
                </svg>
		</span>
	`;

	button.addEventListener("click", async () => {
		const state = getCommentDraftState(editorBody);
		const ticketId = state.ticketId || getCurrentTicketId(editorBody.ownerDocument);
		if (!ticketId) return;

		try {
			state.restoreInProgress = true;
			setCommentEditorHtml(editorBody, "");
			state.lastSavedHtml = "";
			await clearCommentDraft(ticketId);
		} catch (error) {
			console.error("Could not erase comment draft", error);
		} finally {
			state.restoreInProgress = false;
		}
	});

	group.appendChild(button);
	return group;
}

function ensureEraseDraftToolbar(editorBody) {
	const toolbarDoc = getCommentEditorHostDocument();
	const toolbar = toolbarDoc?.querySelector(".tox-toolbar__primary");
	if (!toolbar || toolbar.querySelector('[data-trs-erase-draft-group="true"]')) return;

	const eraseGroup = createEraseDraftToolbarGroup(editorBody);
	const sourceButton = toolbar.querySelector('button[title="Source code"], button[aria-label="Source code"]');
	const sourceGroup = sourceButton?.closest(".tox-toolbar__group");

	if (sourceGroup?.parentNode) {
		sourceGroup.insertAdjacentElement("afterend", eraseGroup);
	} else {
		toolbar.appendChild(eraseGroup);
	}
}

function createInferTimeToolbarGroup() {
	const toolbarDoc = getCommentEditorHostDocument();
	const group = toolbarDoc.createElement("div");
	group.className = "tox-toolbar__group";
	group.dataset.trsInferTimeGroup = "true";
	group.setAttribute("title", "");
	group.setAttribute("role", "toolbar");
	group.setAttribute("data-alloy-tabstop", "true");
	group.tabIndex = -1;

	const button = toolbarDoc.createElement("button");
	button.type = "button";
	button.className = "tox-tbtn";
	button.setAttribute("aria-label", "Infer time");
	button.setAttribute("title", "Infer time");
	button.setAttribute("aria-disabled", "false");
	button.tabIndex = -1;
	button.dataset.trsInferTimeButton = "true";
	button.innerHTML = `
		<span class="tox-icon tox-tbtn__icon-wrap">
			<span class="tox-icon tox-tbtn__icon-wrap">
				<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" focusable="false" style="fill: none;">
					<path d="M5.06152 12C5.55362 8.05369 8.92001 5 12.9996 5C17.4179 5 20.9996 8.58172 20.9996 13C20.9996 17.4183 17.4179 21 12.9996 21H8M13 13V9M11 3H15M3 15H8M5 18H10" stroke="#222f3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
				</svg>
			</span>
		</span>
	`;

	button.addEventListener("click", async () => {
		await runFillTimeFromCommentEditor();
	});

	group.appendChild(button);
	return group;
}

function ensureCommentToolbarButtons(editorBody) {
	const toolbarDoc = getCommentEditorHostDocument();
	const toolbar = toolbarDoc?.querySelector(".tox-toolbar__primary");
	if (!toolbar) return;

	const sourceButton = toolbar.querySelector('button[title="Source code"], button[aria-label="Source code"]');
	const sourceGroup = sourceButton?.closest(".tox-toolbar__group");

	if (!toolbar.querySelector('[data-trs-infer-time-group="true"]')) {
		const inferGroup = createInferTimeToolbarGroup();
		if (sourceGroup?.parentNode) {
			sourceGroup.insertAdjacentElement("afterend", inferGroup);
		} else {
			toolbar.appendChild(inferGroup);
		}
	}

	if (!toolbar.querySelector('[data-trs-erase-draft-group="true"]')) {
		const eraseGroup = createEraseDraftToolbarGroup(editorBody);
		const inferGroup = toolbar.querySelector('[data-trs-infer-time-group="true"]');
		if (inferGroup?.parentNode) {
			inferGroup.insertAdjacentElement("afterend", eraseGroup);
		} else if (sourceGroup?.parentNode) {
			sourceGroup.insertAdjacentElement("afterend", eraseGroup);
		} else {
			toolbar.appendChild(eraseGroup);
		}
	}
}

function bindCommentDraftListeners(editorBody) {
	const state = getCommentDraftState(editorBody);
	if (state.listenersBound) return;

	const saveHandler = () => scheduleCommentDraftSave(editorBody);
	editorBody.addEventListener("input", saveHandler);
	editorBody.addEventListener("keyup", saveHandler);
	editorBody.addEventListener("paste", saveHandler);
	editorBody.addEventListener("cut", saveHandler);

	state.bodyObserver = new MutationObserver(() => {
		scheduleCommentDraftSave(editorBody);
	});
	state.bodyObserver.observe(editorBody, {
		childList: true,
		subtree: true,
		characterData: true
	});

	const toolbarDoc = getCommentEditorHostDocument();
	const toolbarRoot = toolbarDoc?.body || toolbarDoc?.documentElement;
	if (toolbarRoot) {
		state.toolbarObserver = new MutationObserver(() => {
			ensureCommentToolbarButtons(editorBody);
		});
		state.toolbarObserver.observe(toolbarRoot, {
			childList: true,
			subtree: true
		});
	}

	state.listenersBound = true;
}

function isAddCommentSubmitControl(control) {
	if (!(control instanceof Element)) return false;

	const summary = [
		control.id,
		control.getAttribute("name"),
		control.getAttribute("title"),
		control.getAttribute("aria-label"),
		control.getAttribute("value"),
		control.textContent
	].filter(Boolean).join(" ").toLowerCase();

	if (!summary) return false;
	if (summary.includes("erase draft") || summary.includes("fill time") || summary.includes("template")) return false;

	return summary.includes("add comment")
		|| summary.includes("save comment")
		|| summary.includes("post comment")
		|| summary.includes("submit comment");
}

function bindAddCommentSubmitClear(editorBody) {
	const store = getCommentDraftStore();
	const roots = [
		editorBody.ownerDocument,
		findElement("#divEditHDEntryComment_IO")?.closest(".ui-dialog"),
		getTicketDocument(editorBody.ownerDocument),
		document
	].filter(Boolean);

	for (const root of roots) {
		const controls = root.querySelectorAll("button, input[type='button'], input[type='submit'], a");
		for (const control of controls) {
			if (!isAddCommentSubmitControl(control) || store.submitBindings.has(control)) continue;

			control.addEventListener("click", async () => {
				const state = getCommentDraftState(editorBody);
				const ticketId = state.ticketId || getCurrentTicketId(editorBody.ownerDocument);
				if (!ticketId) return;

				try {
					if (state.saveTimerId) {
						clearTimeout(state.saveTimerId);
						state.saveTimerId = 0;
					}
					state.lastSavedHtml = "";
					await clearCommentDraft(ticketId);
				} catch (error) {
					console.error("Could not clear comment draft on submit", error);
				}
			});

			store.submitBindings.add(control);
		}
	}
}

async function ensureCommentDraftFeatures() {
	const editorBody = getCommentEditorBody(false);
	if (!editorBody) return false;

	const state = getCommentDraftState(editorBody);
	const ticketId = getCurrentTicketId(editorBody.ownerDocument);
	resetCommentDraftStateForTicket(state, ticketId);

	bindCommentDraftListeners(editorBody);
	ensureCommentToolbarButtons(editorBody);
	bindAddCommentSubmitClear(editorBody);
	await restoreCommentDraftForEditor(editorBody);
	return true;
}

function scheduleCommentDraftFeatureBinding() {
	const delays = [0, 150, 500, 1200];
	for (const delay of delays) {
		window.setTimeout(() => {
			ensureCommentDraftFeatures().catch(error => {
				console.error("Could not bind comment draft features", error);
			});
		}, delay);
	}
}

function applyTemplateToCommentEditor(template, templateId = "") {
	const tiny = getCommentEditorBody();
	if (!tiny) return null;

	const result = fillTemplate(template, getTicketData());
	const state = getCommentTemplateUiState(tiny);

	if (state.originalContent === null) {
		state.originalContent = tiny.innerHTML;
	}

	tiny.innerHTML = result;
	state.appliedTemplateId = templateId;
	state.appliedContent = result;
	state.cleanTemplateApplied = true;
	saveEditorSelection(tiny);
	scheduleCommentDraftSave(tiny);
	return tiny;
}


function renderApplyTemplateOptions(select) {
	const placeholder = document.createElement("option");
	placeholder.value = "";
	placeholder.textContent = "Apply Template";

	const templatesGroup = document.createElement("optgroup");
	templatesGroup.label = "Templates";

	for (const template of getAllTemplates()) {
		const option = document.createElement("option");
		option.value = template.id;
		option.textContent = template.source === "user" ? `${template.label} (Custom)` : template.label;
		templatesGroup.appendChild(option);
	}

	const actionsGroup = document.createElement("optgroup");
	actionsGroup.label = "Actions";

	const saveOption = document.createElement("option");
	saveOption.value = "__save_current_template__";
	saveOption.textContent = "Save current as new ...";
	actionsGroup.appendChild(saveOption);

	const manageOption = document.createElement("option");
	manageOption.value = "__manage_templates__";
	manageOption.textContent = "Manage Templates";
	actionsGroup.appendChild(manageOption);

	select.replaceChildren(placeholder, templatesGroup, actionsGroup);
	select.value = "";
}


async function saveCurrentEditorContentAsTemplate() {
	const tiny = getCommentEditorBody();
	if (!tiny) return false;

	const content = tiny.innerHTML.trim();
	if (!content) {
		alert("There is no current editor content to save as a template.");
		return false;
	}

	const label = window.prompt("Template name");
	if (!label) return false;

	const nextTemplate = {
		id: createUserTemplateId(label),
		label: label.trim(),
		content
	};

	if (!nextTemplate.label) {
		alert("Template name is required.");
		return false;
	}

	const templates = getUserTemplates();
	templates.push(nextTemplate);

	try {
		await saveUserTemplates(templates);
		return true;
	} catch (error) {
		console.error("Could not save template", error);
		alert("Could not save template.");
		return false;
	}
}



function startLoadingSpinner(field, extraField = null) {
	const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	const verbs = [
		'Generating', 'Speculating', 'Hallucinating', 'Cogitating',
		'Interpolating', 'Synthesizing', 'Theorizing', 'Concocting',
		'Extrapolating', 'Fabricating', 'Contemplating', 'Pontificating'
	];
	let frame = 0;
	let verbIndex = Math.floor(Math.random() * verbs.length);
	field.disabled = true;

	if (extraField) extraField.disabled = true;

	const interval = setInterval(() => {
		const char = spinnerChars[frame % spinnerChars.length];
		field.value = `${char} ${verbs[verbIndex]}...`;
		if (extraField) extraField.value = char;
		frame++;
		if (frame % 25 === 0) verbIndex = (verbIndex + 1) % verbs.length;
	}, 80);

	return (finalValue, extraFinalValue = null) => {
		clearInterval(interval);
		field.disabled = false;
		field.value = finalValue ?? "";
		if (extraField) {
			extraField.disabled = false;
			extraField.value = extraFinalValue ?? "";
		}
	};
}

function showTemporaryFieldMessage(field, message, durationMs = 3000) {
	if (!field) return;

	if (field.__trsMessageTimeout) {
		clearTimeout(field.__trsMessageTimeout);
		delete field.__trsMessageTimeout;
	}

	const previousValue = field.value;
	const previousTransition = field.style.transition;
	const previousOpacity = field.style.opacity;

	field.value = message;
	field.style.transition = "opacity 0.6s ease";
	field.style.opacity = "1";

	field.__trsMessageTimeout = window.setTimeout(() => {
		field.style.opacity = "0";

		window.setTimeout(() => {
			field.value = previousValue;
			field.style.opacity = previousOpacity || "";
			field.style.transition = previousTransition || "";
		}, 600);
	}, Math.max(0, durationMs - 600));
}

async function generateFillTimeSummary(input) {
	const languageOptions = {
		expectedInputs: [{ type: "text", languages: ["en"] }],
		expectedOutputs: [{ type: "text", languages: ["en"] }]
	};

	if (typeof LanguageModel !== "undefined") {
		const availability = await LanguageModel.availability(languageOptions);
		console.log(`[generateFillTimeSummary] LanguageModel availability: ${availability}`);
		if (availability === "available") {
			console.log("[generateFillTimeSummary] Using LanguageModel (Prompt API)");
			const session = await LanguageModel.create({
				...languageOptions,
				initialPrompts: [{ role: "system", content: AI_PROMPTS.fillTimeSummarySystem }],
				temperature: 0.3,
				topK: 15
			});
			try {
				return await session.prompt(AI_PROMPTS.fillTimeSummaryUser(input));
			} catch (err) {
				console.warn("LanguageModel fill-time summary failed:", err);
			} finally {
				session.destroy();
			}
		}
	}

	// Summarizer fallback
	console.log("[generateFillTimeSummary] LanguageModel unavailable, using Summarizer fallback");
	const summarizer = await Summarizer.create({
		sharedContext: "Summarize work done into a single timesheet line.",
		type: "tldr",
		length: "short",
		expectedInputLanguages: ["en-GB"],
		outputLanguage: "en-GB"
	});
	return await summarizer.summarize(input);
}

function roundDurationToQuarterHours(value) {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
	return Math.round(numericValue * 4) / 4;
}

function parseExplicitDurationsFromText(input) {
	const text = String(input || "").toLowerCase();
	const durations = [];
	const seen = new Set();
	const occupiedRanges = [];

	const rangesOverlap = (start, end) => occupiedRanges.some(range => start < range.end && end > range.start);
	const markRange = (start, end) => {
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
		occupiedRanges.push({ start, end });
	};

	const addDuration = (hours, matchIndex, sourceText) => {
		const roundedHours = roundDurationToQuarterHours(hours);
		if (!roundedHours) return;

		const key = `${matchIndex}:${roundedHours}`;
		if (seen.has(key)) return;
		seen.add(key);
		durations.push({
			hours: roundedHours,
			index: matchIndex,
			sourceText: sourceText.trim()
		});
	};

	const combinedPattern = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b|(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/gi;
	for (const match of text.matchAll(combinedPattern)) {
		const matchIndex = match.index ?? 0;
		const matchEnd = matchIndex + match[0].length;

		if (match[1] && match[2]) {
			addDuration(Number(match[1]) + Number(match[2]) / 60, matchIndex, match[0]);
			markRange(matchIndex, matchEnd);
			continue;
		}

		if (match[3] && match[4]) {
			addDuration(Number(match[4]) + Number(match[3]) / 60, matchIndex, match[0]);
			markRange(matchIndex, matchEnd);
		}
	}

	const halfHourPattern = /\bhalf\s+(?:an?\s+)?hour\b/gi;
	for (const match of text.matchAll(halfHourPattern)) {
		const matchIndex = match.index ?? 0;
		const matchEnd = matchIndex + match[0].length;
		if (rangesOverlap(matchIndex, matchEnd)) continue;
		addDuration(0.5, matchIndex, match[0]);
		markRange(matchIndex, matchEnd);
	}

	const numericPattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi;
	for (const match of text.matchAll(numericPattern)) {
		const matchIndex = match.index ?? 0;
		const matchEnd = matchIndex + match[0].length;
		if (rangesOverlap(matchIndex, matchEnd)) continue;

		const amount = Number(match[1]);
		const unit = match[2];
		if (!Number.isFinite(amount)) continue;

		if (/^h(?:ours?)?$|^hrs?$/.test(unit)) {
			addDuration(amount, matchIndex, match[0]);
			continue;
		}

		addDuration(amount / 60, matchIndex, match[0]);
	}

	return durations.sort((a, b) => a.index - b.index);
}

function resolveDeterministicDuration(durations) {
	if (!durations.length) {
		return { duration: null, reason: "missing" };
	}

	const distinctDurations = [...new Set(durations.map(entry => entry.hours))];
	if (distinctDurations.length === 1) {
		return { duration: distinctDurations[0], reason: "explicit-single" };
	}

	return { duration: null, reason: "conflicting" };
}

async function estimateDuration(input) {
	const languageOptions = {
		expectedInputs: [{ type: "text", languages: ["en"] }],
		expectedOutputs: [{ type: "text", languages: ["en"] }]
	};

	if (typeof LanguageModel !== "undefined") {
		const availability = await LanguageModel.availability(languageOptions);
		console.log(`[estimateDuration] LanguageModel availability: ${availability}`);
		if (availability === "available") {
			console.log("[estimateDuration] Using LanguageModel (Prompt API)");
			const session = await LanguageModel.create({
				...languageOptions,
				initialPrompts: [{ role: "system", content: AI_PROMPTS.fillTimeDurationSystem }],
				temperature: 0.1,
				topK: 10
			});
			try {
				const raw = await session.prompt(AI_PROMPTS.fillTimeDurationUser(input));
				let duration = parseFloat(raw);
				if (isNaN(duration) || duration <= 0) duration = 1;
				return roundDurationToQuarterHours(duration) ?? 1;
			} catch (err) {
				console.warn("LanguageModel duration estimate failed:", err);
			} finally {
				session.destroy();
			}
		}
	}

	return null; // No fallback for duration — field left unchanged
}

async function resolveDurationFromCommentContent(commentHtml) {
	const normalizedComment = normalizeRichText(commentHtml);
	const explicitDurations = parseExplicitDurationsFromText(normalizedComment);
	const explicitResolution = resolveDeterministicDuration(explicitDurations);

	if (explicitResolution.duration !== null) {
		return explicitResolution.duration;
	}

	const aiEstimate = await estimateDuration(normalizedComment);
	if (aiEstimate !== null) {
		return aiEstimate;
	}

	return explicitDurations[0]?.hours ?? null;
}

async function runFillTimeFromCommentEditor() {
	const iframe = findElement("#txt_ed_comment_ifr");
	if (!iframe) return;

	const doc = iframe.contentDocument || iframe.contentWindow.document;
	const tiny = doc?.querySelector("#tinymce");
	if (!tiny) { alert("TinyMCE not found."); return; }

	const summaryField = findElement("#txt_tr_comments");
	const durationField = findElement("#txt_tr_duration");
	if (!summaryField) return;

	const commentContent = tiny.innerHTML;
	if (!normalizeRichText(commentContent)) {
		showTemporaryFieldMessage(
			summaryField,
			"This function uses local AI to infer your time based on comment content."
		);
		return;
	}

	const stopSpinner = startLoadingSpinner(summaryField, durationField);

	try {
		const [summary, duration] = await Promise.all([
			generateFillTimeSummary(commentContent),
			durationField ? resolveDurationFromCommentContent(commentContent) : Promise.resolve(null)
		]);

		stopSpinner(summary ?? "", duration);
	} catch (err) {
		stopSpinner("", null);
		console.error("Fill time AI failed:", err);
	}
}

function createSingleLineSummaryButton(label, id) {
	const button = document.createElement("button");
	button.id = id;
	button.type = "button";
	button.className = "ui-button ui-corner-all ui-widget";
	button.textContent = label;

	button.addEventListener("click", async () => {
		await runFillTimeFromCommentEditor();
	});

	return button;
}

// ------------------------------------------
// Utility: to add the button to comment screen
// ------------------------------------------
function createTemplateDropdown() {
	const select = document.createElement("select");
	select.id = "template-picker";
	select.className = "ui-button ui-corner-all ui-widget";
	select.style.minWidth = "140px";
	select.style.margin = "0 8px 0 0";
	select.style.verticalAlign = "middle";
	select.style.textAlign = "left";
	select.style.padding = ".32em 1em";
	select.setAttribute("aria-label", "Apply Template");

	renderApplyTemplateOptions(select);
	select.__unsubscribeTemplates = subscribeToTemplates(() => renderApplyTemplateOptions(select));

	select.addEventListener("change", async () => {
		const selectedValue = select.value;
		select.value = "";

		if (!selectedValue) return;

		if (selectedValue === "__save_current_template__") {
			await saveCurrentEditorContentAsTemplate();
			return;
		}

		if (selectedValue === "__manage_templates__") {
			openTemplateManager();
			return;
		}

		const template = getTemplateById(selectedValue);
		if (!template) return;

		applyTemplateToCommentEditor(template.content, template.id);
	});

	return select;
}

function addTemplateButtons(container) {
	if (!container.querySelector("#template-picker")) {
		container.appendChild(createTemplateDropdown());
	}
}

// ------------------------------------------
// Utility: Lightweight markdown-to-HTML formatter
// ------------------------------------------
function formatMarkdown(text) {
	const escaped = text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

	function applyInline(str) {
		return str
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>');
	}

	const lines = escaped.split('\n');
	let html = '';
	let inOl = false;
	let inUl = false;
	let pendingBreak = false;

	function closeLists() {
		if (inOl) { html += '</ol>'; inOl = false; }
		if (inUl) { html += '</ul>'; inUl = false; }
	}

	for (const line of lines) {
		const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
		const ulMatch = line.match(/^[-*]\s+(.+)$/);

		if (olMatch) {
			pendingBreak = false;
			if (inUl) { html += '</ul>'; inUl = false; }
			if (!inOl) { html += '<ol>'; inOl = true; }
			html += `<li>${applyInline(olMatch[2])}</li>`;
		} else if (ulMatch) {
			pendingBreak = false;
			if (inOl) { html += '</ol>'; inOl = false; }
			if (!inUl) { html += '<ul>'; inUl = true; }
			html += `<li>${applyInline(ulMatch[1])}</li>`;
		} else if (line.trim() !== '') {
			closeLists();
			if (pendingBreak) html += '<br>';
			html += applyInline(line);
			pendingBreak = true;
		} else {
			closeLists();
			if (pendingBreak) { html += '<br><br>'; pendingBreak = false; }
		}
	}

	closeLists();
	return html;
}

// ------------------------------------------
// Find the document containing #udp_Comments
// ------------------------------------------
function findElement(query, root = document) {

	// 1. Try root document
	const found = root.querySelector(query);
	if (found) return found;

	// 2. Scan iframes recursively
	const iframes = root.querySelectorAll("iframe");
	for (const frame of iframes) {
		try {
			const doc = frame.contentDocument || frame.contentWindow.document;
			if (!doc) continue;

			const result = findElement(query, doc);
			if (result) return result;

		} catch (e) {
		}
	}

	return null;
}

// ------------------------------------------
// Extract comment text
// ------------------------------------------

function extractComments(container) {
	const comments = [...container.querySelectorAll('fieldset.mnu_box_page')];

	return comments.map(fs => {
		// --- Extract the legend text ---
		const legend = fs.querySelector('legend');
		let legendText = legend ? legend.innerText.trim() : "";

		// Remove "Edit" or images
		legendText = legendText.replace(/\s*Edit Comment.*$/, "").trim();
		// --- Parse legend for name and date ---
		// Example legend: "Eviosys API User - 05/12/2025 17:13:11 (WN)"
		// const legendMatch = legendText.match(/^(.+?)\s*-\s*(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/);
		const legendMatch = legendText.match(/^(.+?)\s*-\s*([\d/]+\s*[\d:]+)\s*(\((IO|WN)\))?/);
		// const commentBy = legendMatch ? legendMatch[1].trim() : "";
		let commentBy = "", date = null, context = "Customer facing";;

		// if (legendMatch) {
		// 	const dateStr = legendMatch[2].trim(); // "DD/MM/YYYY HH:MM:SS"
		// 	const [day, month, yearAndTime] = dateStr.split('/');
		// 	const [year, time] = [yearAndTime.slice(0, 4), yearAndTime.slice(5) || ""];
		// 	const [hours, minutes, seconds] = time.split(':').map(Number);
		// 	date = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes, seconds);
		// }

		if (legendMatch) {
			commentBy = legendMatch[1].trim();
			const dateStr = legendMatch[2].trim(); // "DD/MM/YYYY HH:MM:SS"
			const [day, month, yearAndTime] = dateStr.split('/');
			const [year, time] = [yearAndTime.slice(0, 4), yearAndTime.slice(5) || ""];
			const [hours, minutes, seconds] = time.split(':').map(Number);
			date = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes, seconds);
			context = legendMatch[4] === "IO" ? "Internal" :
				legendMatch[4] === "WN" ? "Work note" : "Customer facing";
		}

		// --- Extract the comment body ---
		const div = fs.querySelector('.cssform');
		let body = div ? div.innerHTML : "";

		// Convert <br> and <p> to proper newlines and clean HTML
		body = body
			.replace(/<p>/gi, "")
			.replace(/<\/p>/gi, "\n")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/&nbsp;/g, " ")
			.replace(/<[^>]+>/g, "")          // remove remaining HTML tags
			.replace(/\n{3,}/g, "\n\n")       // trim excessive line breaks
			.trim();

		return {
			date,
			commentBy,
			context,
			content: body
		};
	});
}

// ------------------------------------------
// Creates the "summary box" UI
// ------------------------------------------
function insertSummaryBox(targetFieldset) {
	const wrapper = document.createElement("div");
	wrapper.style.position = "relative";

	wrapper.innerHTML = `
    <style>
		.loader {
		width: 50px;
		aspect-ratio: 1;
		display: grid;
		border: 4px solid #0000;
		border-radius: 50%;
		border-right-color: #273167;
		animation: l15 1s infinite linear;
		}
		.loader::before,
		.loader::after {
		content: "";
		grid-area: 1/1;
		margin: 2px;
		border: inherit;
		border-radius: 50%;
		animation: l15 2s infinite;
		}
		.loader::after {
		margin: 8px;
		animation-duration: 3s;
		}
		@keyframes l15{
		100%{transform: rotate(1turn)}
		}

		.loader-container {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 10px 0;
		}

		#ai-summary-box {
		display: block;
		}

		.loader-text {
		font-family: Tahoma, Arial;
		font-size: 1em;
		color: #555555;
		margin: 0;
		width: 320px;
		line-height: 1.4;
		transition: opacity 0.35s ease;
		}
    </style>

    <fieldset class="mnu_box_page">
        <legend>Internal AI generated summary of comments</legend>
        <div class="cssform">
            <div id="ai-summary-box">
                <div class="loader-container">
                    <div class="loader"></div>
                    <div class="loader-text"></div>
                </div>
            </div>
			<div id="ai-key-points-label" style="font-weight:bold; margin-top:8px; display:none;">Key Points</div>
			<div id="ai-key-points"></div>
        </div>
    </fieldset>
`;
	// Insert right after the legend inside the target fieldset
	const fieldset = targetFieldset.querySelector("fieldset");
	if (!fieldset) {
		targetFieldset.prepend(wrapper);
	} else {
		fieldset.insertAdjacentElement("beforebegin", wrapper);
	}

	const summaryBox = wrapper.querySelector("#ai-summary-box");
	const loaderText = wrapper.querySelector(".loader-text");

	const loaderPhrases = [
		"Reading between the lines…",
		"Consulting the ticket oracle…",
		"Distilling chaos into clarity…",
		"Interrogating the comments…",
		"Translating support-speak…",
		"Connecting the dots…",
		"Sifting through the noise…",
		"Extracting signal from static…",
		"Cross-referencing the timeline…",
		"Assembling the narrative…",
		"Making sense of it all…",
		"Wrangling scattered thoughts…",
		"Decoding the paper trail…",
		"Asking the AI nicely…",
		"Summarising at the speed of thought…",
		"Processing… please hold…",
	];

	let phraseIndex = Math.floor(Math.random() * loaderPhrases.length);
	loaderText.textContent = loaderPhrases[phraseIndex];

	const loaderInterval = setInterval(() => {
		loaderText.style.opacity = "0";
		setTimeout(() => {
			phraseIndex = (phraseIndex + 1) % loaderPhrases.length;
			loaderText.textContent = loaderPhrases[phraseIndex];
			loaderText.style.opacity = "1";
		}, 350);
	}, 2800);

	summaryBox.__loaderInterval = loaderInterval;

	return {
		summaryBox,
		keyPoints: wrapper.querySelector("#ai-key-points")
	}
}


async function init() {
	console.log("Initializing extension…");
	initUI();            // Your Extract & Summarise feature
	try {
		await initializeTemplates();
		watchCommentEditor();
	} catch (e) {
		console.error("Could not initialize templates", e);
		watchCommentEditor();
	}
}
init();



// window.addEventListener('click', evt => {
// 	console.info(evt);	
// }, {
// 	capture: false,
// });

async function initUI() {
	console.log("Waiting for .ui-dialog…");

	const dialog = await waitForElement(".ui-dialog");
	const ensureExtractButton = () => {
		if (!getTicketDocument(dialog)) return;

		const buttonBar = dialog.querySelector(".ui-dialog-buttonset");
		if (!buttonBar || buttonBar.querySelector("#extract-btn")) return;

		const newButton = document.createElement("button");
		newButton.id = "extract-btn";
		newButton.type = "button";
		newButton.className = "ui-button ui-corner-all ui-widget";
		newButton.textContent = "AI Summary";
		newButton.addEventListener("click", onExtractCommentsClick);

		if (buttonBar.firstElementChild) {
			buttonBar.firstElementChild.insertAdjacentElement("beforebegin", newButton);
		} else {
			buttonBar.appendChild(newButton);
		}

		console.log("Extract+Summarise button added.");
	};

	await waitForElement(".ui-dialog-buttonset", dialog);
	ensureExtractButton();

	if (!dialog.__trsExtractButtonObserver) {
		const observer = new MutationObserver(() => {
			ensureExtractButton();
		});

		observer.observe(dialog, {
			childList: true,
			subtree: true
		});

		dialog.__trsExtractButtonObserver = observer;
	}

	refreshTicketData(dialog);
	watchTicketFrameChanges(dialog);
}

async function onExtractCommentsClick() {
	console.log("AI Summary clicked");

	// Switch to the Comments tab so the summary box is visible
	findElement('a.ui-tabs-anchor[href="#Comments"]')?.click();

	if (findElement("#ai-summary-box")) {
		console.info("AI summary already present, no need to add another one.");
		return;
	}

	const comments = getTicketData().comments;
	if (!comments?.length) {
		console.info("No cached comments available. Ticket data may not have loaded yet.");
		return;
	}

	const commentSection = findElement("#udp_Comments");
	if (!commentSection) {
		console.info("Could not find udp_Comments for UI insertion. onExtractCommentsClick");
		return;
	}

	const recentComments = comments.slice(0, 10);
	const inputForAI = prepareCommentsForSummarizer(recentComments);
	const { summaryBox, keyPoints: keyPointsBox } = insertSummaryBox(commentSection);

	await generateSummary(inputForAI, summaryBox, keyPointsBox);
}

// ---------------------------
// AI prompt definitions
// ---------------------------
const AI_PROMPTS = {
	summarySystem: `You are an assistant that summarizes IT support ticket comments.
Always respond in English.
Write 3 to 5 sentences. Do not write more than 5 sentences.
Only use information explicitly present in the comments. No speculation.`,

	summaryUser: (input) =>
		`Summarize these support ticket comments in 3-5 sentences.\nThe comments are ordered from newest to oldest — start your summary from the latest activity and work backwards.\nCover: current status, what was last done, any blockers, and next action if known.\n\n${input}`,

	keyPointsSystem: `You are an assistant that extracts milestones from support ticket comments.
Always respond in English.
Only use information explicitly present in the comments provided.`,

	keyPointsUser: (input) =>
		`Extract the key milestones or turning points from these support ticket comments.\nReturn each point as a plain sentence on its own line, from most recent to oldest.\n\n${input}`,

	fillTimeSummarySystem: `You are an assistant that writes one-sentence summaries for IT support timesheets.
Always respond in English.
Output exactly one concise sentence. No bullet points, no numbering, no extra text.
Infer what work was done from the comment. Be professional and clear.`,

	fillTimeSummaryUser: (input) =>
		`Write a single timesheet line summarizing the work done based on this comment:\n\n${input}`,

	fillTimeDurationSystem: `You are an assistant that estimates IT support task durations.
Always respond with only a number.
Output a single decimal number in hours using 0.25 increments (e.g. 0.25, 0.5, 0.75, 1, 1.25, 1.5).
If the comment explicitly states time spent or duration, preserve that stated duration instead of re-estimating it.
If the comment contains multiple conflicting durations, prefer the duration that most likely represents actual time spent.
No text, no units, no explanation — only the number.
If unsure, round up to the nearest 0.25.`,

	fillTimeDurationUser: (input) =>
		`Estimate the hours required to complete this IT support task based on the comment. If the comment already states the time spent, return that duration exactly in hours using 0.25 increments.\n\n${input}`
};

// ---------------------------
// Generate summary (+ key-points on Summarizer fallback)
// ---------------------------
async function generateSummary(input, summaryBox, keyPointsBox = null) {
	const hasPromptAPI = typeof LanguageModel !== "undefined";

	if (hasPromptAPI) {
		const languageOptions = {
			expectedInputs: [{ type: "text", languages: ["en"] }],
			expectedOutputs: [{ type: "text", languages: ["en"] }]
		};
		const availability = await LanguageModel.availability(languageOptions);
		console.log(`[generateSummary] LanguageModel availability: ${availability}`);
		if (availability === "available") {
			console.log("[generateSummary] Using LanguageModel (Prompt API)");
			const session = await LanguageModel.create({
				...languageOptions,
				initialPrompts: [{ role: "system", content: AI_PROMPTS.summarySystem }],
				temperature: 0.4,
				topK: 20
			});
			try {
				const stream = session.promptStreaming(AI_PROMPTS.summaryUser(input));
				await typewriterUpdate(stream, summaryBox);
				return;
			} catch (err) {
				console.warn("LanguageModel summary failed, falling back to Summarizer:", err);
			} finally {
				session.destroy();
			}
		}
	}

	// Fallback: Summarizer — generate summary then key-points
	console.log("[generateSummary] LanguageModel unavailable, using Summarizer fallback");
	try {
		const summarizer = await Summarizer.create({
			sharedContext: "A general summary of support ticket comments, emphasizing latest status, blockers, and next actions.",
			type: "tldr",
			length: "short",
			expectedInputLanguages: ["en-GB"],
			outputLanguage: "en-GB"
		});
		const stream = await summarizer.summarizeStreaming(input);
		await typewriterUpdate(stream, summaryBox);
	} catch (err) {
		if (summaryBox.__loaderInterval) {
			clearInterval(summaryBox.__loaderInterval);
			delete summaryBox.__loaderInterval;
		}
		summaryBox.textContent = "Failed to generate summary.";
		console.error("generateSummary failed:", err);
		return;
	}

	if (!keyPointsBox) return;

	try {
		const kpSummarizer = await Summarizer.create({
			sharedContext: "A list of key milestones showing how the support ticket evolved, from latest to earliest.",
			type: "key-points",
			length: "medium",
			expectedInputLanguages: ["en-GB"],
			outputLanguage: "en-GB"
		});
		const keyPoints = await kpSummarizer.summarize(input);
		document.querySelector("#ai-key-points-label")?.style.setProperty("display", "");
		keyPointsBox.innerHTML = formatMarkdown(keyPoints);
	} catch (err) {
		keyPointsBox.textContent = "Failed to generate key points.";
		console.error("generateKeyPoints failed:", err);
	}
}

// ------------------------------------------
// Refresh ticket data
// ------------------------------------------
async function refreshTicketData(dialog) {

	console.log("Ticket opened → refreshing ticketData");
	const ticketDoc = await waitForTicketDocumentReady(dialog);
	if (!ticketDoc) {
		console.info("Could not resolve the ticket iframe document. refreshTicketData");
		return;
	}

	const commentSection = ticketDoc.querySelector("#udp_Comments");
	if (!commentSection) {
		console.info("Could not find udp_Comments. refreshTicketData");
		return;
	}
	// 2. Extract comments
	const comments = extractComments(commentSection);
	const lastCommentObj = getLastCustomerFacingComment(comments);
	const prevCommentObj = getPreviousToLastCustomerFacingComment(comments);

	const nextTicketData = createEmptyTicketData();
	nextTicketData.personName = getInputValue(ticketDoc, "#txt_ed_reported_by");
	nextTicketData.lastComment = lastCommentObj?.content ?? "";
	nextTicketData.lastCommentDate = lastCommentObj?.date ? new Date(lastCommentObj.date).toLocaleDateString("en-GB") : "";
	nextTicketData.previousToLastCommentDate = prevCommentObj?.date ? new Date(prevCommentObj.date).toLocaleDateString("en-GB") : "";
	nextTicketData.nextContactDate = getInputValue(ticketDoc, "#txt_next_contact_date");
	nextTicketData.totalTimeCON = getNumericValue(ticketDoc, "#lbl_total_time_CON");
	nextTicketData.totalTimeCUS = getNumericValue(ticketDoc, "#lbl_total_time_CUS");
	nextTicketData.totalTicketTime = getNumericValue(ticketDoc, "#txt_ed_quote");
	nextTicketData.status = getSelectedText(ticketDoc, "#ddl_status");
	nextTicketData.title = getInputValue(ticketDoc, "#txt_ed_title");
	nextTicketData.priority = getSelectedText(ticketDoc, "#ddl_ed_priority");
	nextTicketData.entryType = getTextContent(ticketDoc, "#lbl_entry_type");
	nextTicketData.owner = getSelectedText(ticketDoc, "#ddl_owner");
	nextTicketData.assignedTo = getSelectedText(ticketDoc, "#ddl_assigned_to");
	nextTicketData.loggedBy = getTextContent(ticketDoc, "#lbl_ed_logged_by2");
	nextTicketData.loggedDate = getTextContent(ticketDoc, "#lbl_logged_date");
	nextTicketData.externalId = getOverviewFieldValue(ticketDoc, "External ID");
	nextTicketData.deliveryDate = getInputValue(ticketDoc, "#txt_ed_solution_del_date");
	nextTicketData.details = await waitForTinyMceText(ticketDoc, "txt_ed_details");
	nextTicketData.comments = comments;

	const warnings = buildTicketWarnings(nextTicketData, lastCommentObj?.date ?? null);
	renderTicketNotifications(ticketDoc, warnings);

	getSharedWindow().ticketData = nextTicketData;
	console.log("ticketData updated:", getTicketData());

}

async function watchCommentEditor() {
	const attachButtons = (root = document) => {
		const editors = root.querySelectorAll("#divEditHDEntryComment_IO");
		for (const editor of editors) {
			addTemplateButtons(editor);
			scheduleCommentDraftFeatureBinding();
		}
	};

	attachButtons();
	await waitForElement("#divEditHDEntryComment_IO");
	attachButtons();

	const observer = new MutationObserver(mutations => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!(node instanceof Element)) continue;

				if (node.matches("#divEditHDEntryComment_IO")) {
					attachButtons(node.parentElement || document);
					continue;
				}

				if (node.querySelector("#divEditHDEntryComment_IO")) {
					attachButtons(node);
				}
			}
		}
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true
	});
}

async function typewriterUpdate(stream, element) {
	if (element.__loaderInterval) {
		clearInterval(element.__loaderInterval);
		delete element.__loaderInterval;
	}

	let displayed = "";
	let pending = "";
	let rafId = null;

	function drainBuffer() {
		rafId = null;
		if (!pending.length) return;
		// ~6 chars per frame at 60fps ≈ 360 chars/sec — smooth and readable
		const batch = pending.slice(0, 6);
		pending = pending.slice(6);
		displayed += batch;
		element.innerHTML = formatMarkdown(displayed);
		if (pending.length) rafId = requestAnimationFrame(drainBuffer);
	}

	for await (const chunk of stream) {
		pending += chunk;
		if (rafId === null) rafId = requestAnimationFrame(drainBuffer);
	}

	// Flush any characters still in the buffer after the stream ends
	await new Promise(resolve => {
		function flush() {
			if (!pending.length) { resolve(); return; }
			const batch = pending.slice(0, 6);
			pending = pending.slice(6);
			displayed += batch;
			element.innerHTML = formatMarkdown(displayed);
			requestAnimationFrame(flush);
		}
		if (pending.length) requestAnimationFrame(flush);
		else resolve();
	});
}

}
