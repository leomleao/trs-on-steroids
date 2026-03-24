if (window.__trsOnSteroidsInitialized) {
	console.debug("TRS on Steroids already initialized in this frame, skipping bootstrap.");
} else {
	window.__trsOnSteroidsInitialized = true;
	console.log("in-page.js loaded");

	const sharedWindow = getSharedWindow();
	sharedWindow.ticketData = sharedWindow.ticketData || createEmptyTicketData();


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

async function waitForElementDeep(selector, root = document, timeoutMs = 10000, intervalMs = 250) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const found = findElement(selector, root);
		if (found) return found;

		await new Promise(resolve => setTimeout(resolve, intervalMs));
	}

	return null;
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
		details: ""
	};
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

	if (normalizedPriority && normalizedPriority !== "p4" && lastCommentDaysPast > 3) {
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
		notificationPanel.style.margin = "0 0 18px 0";
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

function getCommentEditorBody() {
	const iframe = findElement("#txt_ed_comment_ifr");
	if (!iframe) return null;

	const doc = iframe.contentDocument || iframe.contentWindow.document;
	if (!doc) return null;

	const tiny = doc.querySelector("#tinymce");
	if (!tiny) {
		alert("TinyMCE not found.");
		return null;
	}

	return tiny;
}

function applyTemplateToCommentEditor(template) {
	const tiny = getCommentEditorBody();
	if (!tiny) return null;

	const result = fillTemplate(template, getTicketData());
	tiny.innerHTML = result;
	return tiny;
}

function createTemplateDropdown(templates) {
	const wrapper = document.createElement("span");
	wrapper.id = "template-picker-wrapper";
	wrapper.style.display = "inline-flex";
	wrapper.style.alignItems = "center";
	wrapper.style.gap = "6px";
	wrapper.style.verticalAlign = "middle";

	const select = document.createElement("select");
	select.id = "template-picker";
	select.className = "ui-button ui-corner-all ui-widget";
	select.style.minWidth = "140px";
	select.style.margin = "0 8px 0 0";
	select.style.verticalAlign = "middle";
	select.style.textAlign = "left";
	select.style.padding = ".32em 1em";
	select.setAttribute("aria-label", "Apply Template");

	const placeholder = document.createElement("option");
	placeholder.value = "";
	placeholder.textContent = "Apply Template";
	select.appendChild(placeholder);

	const options = [
		{ label: "3rd Strike", value: "template1" },
		{ label: "2nd Strike", value: "template2" },
		{ label: "Closure", value: "template3" }
	];

	for (const optionConfig of options) {
		const option = document.createElement("option");
		option.value = optionConfig.value;
		option.textContent = optionConfig.label;
		select.appendChild(option);
	}

	let originalContent = null;

	select.addEventListener("change", () => {
		const tiny = getCommentEditorBody();
		if (!tiny) {
			select.value = "";
			return;
		}

		if (select.value === "") {
			if (originalContent !== null) {
				tiny.innerHTML = originalContent;
			}
			originalContent = null;
			return;
		}

		if (!templates[select.value]) {
			return;
		}

		if (originalContent === null) {
			originalContent = tiny.innerHTML;
		}

		applyTemplateToCommentEditor(templates[select.value]);
	});

	wrapper.appendChild(select);

	return wrapper;
}

function createSingleLineSummaryButton(label, id) {
	const button = document.createElement("button");
	button.id = id;
	button.type = "button";
	button.className = "ui-button ui-corner-all ui-widget";
	button.textContent = label;

	button.addEventListener("click", async () => {
		const iframe = findElement("#txt_ed_comment_ifr");
		if (!iframe) return null;

		const doc = iframe.contentDocument || iframe.contentWindow.document;
		if (!doc) return null;

		const tiny = doc.querySelector("#tinymce");
		if (!tiny) {
			alert("TinyMCE not found.");
			return;
		}

		const currentComment = tiny.innerHTML;

		// -------------------------
		// 1. Generate single-line summary
		// -------------------------
		const summaryField = findElement("#txt_tr_comments");
		if (!summaryField) return;

		try {
			let singleLineSummary = "";
			const hasPromptAPI = typeof LanguageModel !== "undefined";

			if (hasPromptAPI) {
				const availability = await LanguageModel.availability();
				if (availability === "available") {
					const session = await LanguageModel.create({
						initialPrompts: [
							{
								role: "system",
								content: `
								You are an assistant that summarizes user comments for display in a web interface.
								Output exactly one concise sentence in text. You're infering what was done based on the comment.
								Do not add extra text, explanations, or numbering.
								Focus on the main point or action implied by the comments.
								Keep it clear, professional, and self-contained.
								`.trim()
							}
						]
					});

					const prompt = [
						{
							role: "user",
							content: `
							Summarize the work carried out based on the comment. 
							It will justify the time spent on this piece of work in the timesheet.					
							Comment:
							${currentComment}
									`.trim()
						}
					];

					singleLineSummary = await session.prompt(prompt);
				}
			}

			// Fallback if PromptAI is not available
			if (!singleLineSummary) {
				console.log("Single line summary falls back to summarizer");

				const summarizer = await Summarizer.create({
					sharedContext: "Summarize comments into a single sentence.",
					type: "tldr",
					length: "short",
					expectedInputLanguages: ["en-GB"],
					outputLanguage: "en-GB"
				});
				singleLineSummary = await summarizer.summarize(currentComment);
			}

			summaryField.value = singleLineSummary;


			// -------------------------
			// 2. Optional: Estimate duration using Prompt AI
			// -------------------------
			const durationField = findElement("#txt_tr_duration");
			if (durationField && hasPromptAPI) {
				try {
					const session = await LanguageModel.create({
						initialPrompts: [
							{
								role: "system",
								content: `
								You are an assistant that estimates the total effort required for a task based on user comments.
								Output only a numeric value representing hours, using increments of 0.25 (e.g., 0.25, 0.5, 0.75, 1, 1.25).
								Do not include any text, units, or explanations—only the number.
								If unsure, round up to the nearest 0.25.
								Focus on all the comments provided to determine the total time.
								`.trim()
							}
						]
					});

					const prompt = [
						{
							role: "user",
							content: `Estimate the total hours it would take to complete the following task based on the comments: \n\n${currentComment}`
						}
					];

					
					let duration = await session.prompt(prompt);
					console.log("Estimated time from ai:" + duration)

					// Normalize duration to increments of 0.25
					duration = parseFloat(duration);
					if (isNaN(duration) || duration <= 0) duration = 1;
					duration = Math.round(duration * 4) / 4;

					durationField.value = duration;
				} catch (err) {
					console.warn("Failed to estimate duration:", err);
				}
			}

		} catch (err) {
			alert("Failed to generate summary.");
			console.error(err);
		}
	});

	return button;
}

// ------------------------------------------
// Utility: to add the button to comment screen
// ------------------------------------------
function addTemplateButtons(container, templates) {
	// Prevent duplicates
	if (container.querySelector("#template-picker-wrapper")) return;

	const btn1 = createSingleLineSummaryButton("Fill time", "single-line-summary");
	const templateDropdown = createTemplateDropdown(templates);

	container.appendChild(btn1);
	container.appendChild(templateDropdown);
}

// ------------------------------------------
// Utility: Coversion to UL and LI tags
// ------------------------------------------
function convertTextToList(text) {
	// Utility function to escape HTML special characters
	function escapeHtml(str) {
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	// Split strictly by " - " (space-hyphen-space) only, not single hyphens inside words
	const items = text
		.split('- ')
		.map(item => item.trim())
		.filter(item => item !== '');

	// Wrap each item in <li> with escaped content
	const listItems = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');

	// Wrap everything in <ul>
	return `<br>Key Points:<br><ul>${listItems}</ul>`;
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
		border-right-color: #020089;
		animation: l15 1s infinite linear;
		margin-left: 20%;
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

		#ai-summary-box {
		display: flex;
		align-items: center;
		}
	
		.loader-text {
		font-family: Tahoma, Arial;
		font-size: 1.2em;
		color: #333333;
		text-align: center;
		margin-top: 10%;
		}
    </style>

    <fieldset class="mnu_box_page">
        <legend>Internal AI generated summary of comments</legend>
        <div class="cssform">
            <div id="ai-summary-box">
                <div class="loader-container">
                    <div class="loader"></div>
                    <div class="loader-text">Loading summary…</div>
                </div>
            </div>
			<div id="ai-key-points">                
            </div>
        </div>
    </fieldset>
`;
	// Insert right after the legend inside the target fieldset
	const fieldset = targetFieldset.querySelector("fieldset");
	fieldset.insertAdjacentElement("beforebegin", wrapper);

	return {
		summaryBox: wrapper.querySelector("#ai-summary-box"),
		keyPoints: wrapper.querySelector("#ai-key-points")
	}
}


async function init() {
	console.log("Initializing extension…");
	initUI();            // Your Extract & Summarise feature
	try {
		const url = chrome.runtime.getURL("templates.json");
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const templates = await res.json();
		watchCommentEditor(templates);
	} catch (e) {
		console.error("Could not load templates", e);
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
		const buttonBar = dialog.querySelector(".ui-dialog-buttonset");
		if (!buttonBar || buttonBar.querySelector("#extract-btn")) return;

		const newButton = document.createElement("button");
		newButton.id = "extract-btn";
		newButton.type = "button";
		newButton.className = "ui-button ui-corner-all ui-widget";
		newButton.textContent = "Extract & Summarise Comments";
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
	console.log("Extract & Summarise comments clicked");

	const summary = findElement("#ai-summary-box");
	if (summary) {
		console.info("AI summary already present, no need to add another one.");
		return;
	}

	const commentSection = findElement("#udp_Comments");
	if (!commentSection) {
		console.info("Could not find udp_Comments. onExtractCommentsClick");
		return;
	}

	const comments = extractComments(commentSection);
	if (!comments.length) {
		console.info("No comments found. onExtractCommentsClick");
		return;
	}

	const inputForAI = prepareCommentsForSummarizer(comments);

	const summaryElements = insertSummaryBox(commentSection);
	const summaryBox = summaryElements.summaryBox;
	const keyPointsBox = summaryElements.keyPoints;

	await generateSummary(inputForAI, summaryBox);
	await generateKeyPoints(inputForAI, keyPointsBox);
}

// ---------------------------
// Generate summary
// ---------------------------
async function generateSummary(input, summaryBox) {
	try {
		// 1. Check if Prompt API is available
		const hasPromptAPI = typeof LanguageModel !== "undefined";
		let usedPromptAPI = false;

		if (hasPromptAPI) {
			try {
				// Check model availability
				const availability = await LanguageModel.availability();
				if (availability === "available") {
					usedPromptAPI = true;

					// Create a session with a system prompt for summarization
					const session = await LanguageModel.create({
						initialPrompts: [
							{
								role: "system",
								content: "You are an assistant that summarizes user comments for display in a web interface.Avoid unnecessary text. Focus on the main points and latest updates. Keep it concise. You are a helpful assistant."
							}
						]
					});

					// Run prompting for summary
					const prompt = [
						{
							role: "user",
							content: `Summarize the following user comments into paragraphs, focusing on main points and latest updates:\n\n${input}`
						}
					];

					const stream = session.promptStreaming(prompt);

					await typewriterUpdate(stream, summaryBox, 5);

				}
			} catch (err) {
				console.warn("Prompt API available but failed:", err);
				usedPromptAPI = false;
			}
		}

		// 2. Fallback to existing Summarizer if Prompt API not used
		if (!usedPromptAPI) {
			// Insert fallback indicator
			summaryBox.textContent = "Generating summary...";

			const summarizer = await Summarizer.create({
				sharedContext:
					"A general summary of what the comments have discussed so far, emphasizing the latest status.",
				type: "tldr",
				length: "short",
				expectedInputLanguages: ["en-GB"],
				outputLanguage: "en-GB",
			});

			const stream = await summarizer.summarizeStreaming(input);

			// Show streaming output
			await typewriterUpdate(stream, summaryBox, 5);
		}
	} catch (err) {
		summaryBox.textContent = "Failed to generate summary.";
		console.error("Summariser error:", err);
	}
}

// ---------------------------
// Generate key points
// ---------------------------
async function generateKeyPoints(input, keyPointsBox) {
	try {
		const summarizer = await Summarizer.create({
			sharedContext:
				"A list of key-points of how the comments have evolved, from the latest to earliest.",
			type: "key-points",
			length: "medium",
			expectedInputLanguages: ["en-GB"],
			outputLanguage: "en-GB",
		});

		const keyPoints = await summarizer.summarize(input);
		keyPointsBox.innerHTML = convertTextToList(keyPoints);
	} catch (err) {
		keyPointsBox.innerHTML = "Failed to generate key points.";
		console.error("Summariser error:", err);
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

	const warnings = buildTicketWarnings(nextTicketData, lastCommentObj?.date ?? null);
	renderTicketNotifications(ticketDoc, warnings);

	getSharedWindow().ticketData = nextTicketData;
	console.log("ticketData updated:", getTicketData());

}

async function watchCommentEditor(templates) {
	const processedEditors = new WeakSet();

	const attachButtons = (root = document) => {
		const editors = root.querySelectorAll("#divEditHDEntryComment_IO");
		for (const editor of editors) {
			if (processedEditors.has(editor)) continue;

			addTemplateButtons(editor, templates);
			processedEditors.add(editor);
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

async function typewriterUpdate(stream, Element, delay = 20) {
	let aiText = "";

	for await (const chunk of stream) {
		// Add each character individually
		for (const char of chunk) {
			aiText += char;
			Element.textContent = aiText;
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
}

}
