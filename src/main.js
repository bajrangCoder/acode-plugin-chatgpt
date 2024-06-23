import plugin from "../plugin.json";
import style from "./style.scss";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

import { base64StringToBlob } from "blob-util";
import { v4 as uuidv4 } from "uuid";
import copy from "copy-to-clipboard";
import { APIKeyManager } from "./api_key";
import { AI_PROVIDERS } from "./constants";
import { getModelsFromProvider } from "./utils";

const multiPrompt = acode.require("multiPrompt");
const fs = acode.require("fs");
const select = acode.require("select");
const prompt = acode.require("prompt");
const DialogBox = acode.require("dialogBox");
const helpers = acode.require("helpers");
const loader = acode.require("loader");
const sidebarApps = acode.require("sidebarApps");
const toInternalUrl = acode.require("toInternalUrl");
const { editor } = editorManager;

const AI_HISTORY_PATH = window.DATA_STORAGE + "chatgpt";

let CURRENT_SESSION_FILEPATH = null;

class Chatgpt {
	async init($page) {
		/**
		 * Scripts and styles for Highlighting
		 * and formating ai response
		 */

		this.$githubDarkFile = tag("link", {
			rel: "stylesheet",
			href: this.baseUrl + "assets/github-dark.css"
		});
		this.$higlightJsFile = tag("script", {
			src: this.baseUrl + "assets/highlight.min.js"
		});
		this.$markdownItFile = tag("script", {
			src: this.baseUrl + "assets/markdown-it.min.js"
		});
		// Global styles
		this.$style = tag("style", {
			textContent: style
		});
		document.head.append(
			this.$githubDarkFile,
			this.$higlightJsFile,
			this.$markdownItFile,
			this.$style
		);

		/**
		 * Adding command for starting chatgpt
		 * And updating its token
		 */

		editor.commands.addCommand({
			name: "ai_assistant",
			description: "AI Assistant",
			exec: this.run.bind(this)
		});

		/*editor.commands.addCommand({
			name: "chatgpt_update_token",
			description: "Update Chat GPT Token",
			exec: this.updateApiToken.bind(this)
		});*/

		$page.id = "acode-ai-assistant";
		$page.settitle("AI Assistant");
		this.$page = $page;
		const menuBtn = tag("span", {
			className: "icon more_vert",
			dataset: {
				action: "toggle-menu"
			}
		});

		// button for new chat
		const newChatBtn = tag("span", {
			className: "icon add",
			dataset: {
				action: "new-chat"
			}
		});
		this.$page.header.append(newChatBtn, menuBtn);

		menuBtn.onclick = this.myHistory.bind(this);
		newChatBtn.onclick = this.newChat.bind(this);

		const mainApp = tag("div", {
			className: "mainApp"
		});
		// main chat box
		this.$chatBox = tag("div", {
			className: "chatBox"
		});
		// bottom query taker box
		this.$inputBox = tag("div", {
			className: "inputBox"
		});

		this.$chatTextarea = tag("textarea", {
			className: "chatTextarea",
			placeholder: "Type your query..."
		});
		this.$sendBtn = tag("button", {
			className: "sendBtn"
		});
		this.$sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14L21 3m0 0l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3"/></svg>`;
		this.$inputBox.append(this.$chatTextarea, this.$sendBtn);
		mainApp.append(this.$inputBox, this.$chatBox);
		this.$page.append(mainApp);
		this.messageHistories = {};
		this.messageSessionConfig = {
			configurable: {
				sessionId: uuidv4()
			}
		};
	}

	async run() {
		try {
			let passPhrase;
			if (await fs(window.DATA_STORAGE + "secret.key").exists()) {
				passPhrase = await fs(window.DATA_STORAGE + "secret.key").readFile(
					"utf-8"
				);
			} else {
				let secretPassphrase = await prompt(
					"Enter a secret pass pharse to save the api key",
					"",
					"text",
					{
						required: true
					}
				);
				if (!secretPassphrase) return;
				passPhrase = secretPassphrase;
			}
			this.apiKeyManager = new APIKeyManager(passPhrase);
			let token;
			let providerNme = window.localStorage.getItem("ai-assistant-provider");
			if (providerNme) {
				token = await this.apiKeyManager.getAPIKey(providerNme);
			} else {
				let modelProvider = await select("Select AI Provider", AI_PROVIDERS);
				// no prompt for api key in case of ollama
				let apiKey =
					modelProvider == AI_PROVIDERS[3]
						? "No Need Of API Key"
						: await prompt("API key of selected provider", "", "text", {
								required: true
						  });
				if (!apiKey) return;
				loader.showTitleLoader();
				window.toast("Fetching available models from your account", 2000);
				let modelList = await getModelsFromProvider(modelProvider, apiKey);
				loader.removeTitleLoader();
				const modelNme = await select("Select AI Model", modelList);

				window.localStorage.setItem("ai-assistant-provider", modelProvider);
				window.localStorage.setItem("ai-assistant-model-name", modelNme);
				providerNme = modelProvider;
				token = apiKey;
				await fs(window.DATA_STORAGE).createFile("secret.key", passPhrase);
				await this.apiKeyManager.saveAPIKey(providerNme, token);
				window.toast("Configuration saved 🎉", 3000);
			}

			let model = window.localStorage.getItem("ai-assistant-model-name");

			switch (providerNme) {
				case AI_PROVIDERS[0]:
					this.modelInstance = new ChatOpenAI({ apiKey: token, model });
					break;
				case AI_PROVIDERS[1]:
					this.modelInstance = new ChatGoogleGenerativeAI({
						model,
						apiKey: token,
						safetySettings: [
							{
								category: HarmCategory.HARM_CATEGORY_HARASSMENT,
								threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
							}
						]
					});
					break;
				case AI_PROVIDERS[2]:
					this.modelInstance = new ChatOpenAI({
						apiKey: token,
						model,
						azureOpenAIBasePath: "https://api.deepseek.com/v1"
					});
					break;
				case AI_PROVIDERS[3]:
					this.modelInstance = new ChatOllama({ model });
					break;
				case AI_PROVIDERS[4]:
					this.modelInstance = new ChatGroq({
						apiKey: token,
						model
					});
					break;
				default:
					throw new Error("Unknown provider");
			}
			this.$mdIt = window.markdownit({
				html: false,
				xhtmlOut: false,
				breaks: false,
				linkify: false,
				typographer: false,
				quotes: "“”‘’",
				highlight: function (str, lang) {
					const copyBtn = document.createElement("button");
					copyBtn.classList.add("copy-button");
					copyBtn.innerHTML = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" height="1.5em" width="1.5em"><path fill="currentColor" d="M15 37.95q-1.25 0-2.125-.875T12 34.95v-28q0-1.25.875-2.125T15 3.95h22q1.25 0 2.125.875T40 6.95v28q0 1.25-.875 2.125T37 37.95Zm0-3h22v-28H15v28Zm-6 9q-1.25 0-2.125-.875T6 40.95V12.3q0-.65.425-1.075Q6.85 10.8 7.5 10.8q.65 0 1.075.425Q9 11.65 9 12.3v28.65h22.2q.65 0 1.075.425.425.425.425 1.075 0 .65-.425 1.075-.425.425-1.075.425Zm6-37v28-28Z"/></svg>`;
					copyBtn.setAttribute("data-str", str);
					const codesArea = `<pre class="hljs codesArea"><code>${
						hljs.highlightAuto(str).value
					}</code></pre>`;
					const codeBlock = `<div class="codeBlock">${copyBtn.outerHTML}${codesArea}</div>`;
					return codeBlock;
				}
			});

			this.$sendBtn.addEventListener("click", this.sendQuery.bind(this));

			this.$page.show();
		} catch (e) {
			console.log(e);
		}
	}

	_sanitizeFileName(fileName) {
		/*
    utility function for removing special characters and 
    white spaces from file names
    */
		// Remove special characters and symbols
		const sanitizedFileName = fileName.replace(/[^\w\s.-]/gi, "");
		// Trim leading and trailing spaces
		const trimmedFileName = sanitizedFileName.trim();
		// Replace spaces with underscores
		const finalFileName = trimmedFileName.replace(/\s+/g, "_");
		return finalFileName;
	}

	transformMessages(messages) {
		const result = messages
			.map((message, index) => {
				// Assuming every even-indexed element (0, 2, 4,...) is a human message
				// and the subsequent odd-indexed element (1, 3, 5,...) is its corresponding AI message
				if (index % 2 === 0 && index + 1 < messages.length) {
					return {
						prompt: messages[index].content,
						result: messages[index + 1].content
					};
				} else {
					return null; // Handle uneven or incomplete pairs if necessary
				}
			})
			.filter(pair => pair !== null);

		return result;
	}

	async saveHistory() {
		/*
    save chat history 
    */
		try {
			let sessionId = this.messageSessionConfig.configurable.sessionId;
			if (!this.messageHistories[sessionId].messages.length) {
				return;
			}

			if (CURRENT_SESSION_FILEPATH == null) {
				try {
					const sanitisedFileNme = this._sanitizeFileName(
						this.messageHistories[sessionId].messages[0].content.substring(
							0,
							30
						)
					);
					const uniqueName = `${sanitisedFileNme}__${sessionId}.json`;

					if (!(await fs(AI_HISTORY_PATH).exists())) {
						await fs(window.DATA_STORAGE).createDirectory("chatgpt");
					}
					let messages = await this.messageHistories[sessionId].getMessages();
					const history = this.transformMessages(messages);
					CURRENT_SESSION_FILEPATH = await fs(AI_HISTORY_PATH).createFile(
						uniqueName,
						history
					);
				} catch (err) {
					alert(err.message);
				}
			} else {
				try {
					if (!(await fs(CURRENT_SESSION_FILEPATH).exists())) {
						this.newChat();
						window.toast(
							"Some error occurred or file you trying to open has been deleted"
						);
						return;
					}

					let messages = await this.messageHistories[sessionId].getMessages();

					CURRENT_SESSION_FILEPATH = await fs(
						CURRENT_SESSION_FILEPATH
					).writeFile(this.transformMessages(messages));
				} catch (err) {
					alert(err.message);
				}
			}
		} catch (err) {
			window.alert(err.message);
		}
	}

	newChat() {
		/*
    Start new chat session
    */
		this.$chatBox.innerHTML = "";
		window.toast("New session", 3000);
		this.messageHistories = {};
		this.messageSessionConfig = {
			configurable: {
				sessionId: uuidv4()
			}
		};
		CURRENT_SESSION_FILEPATH = null;
	}

	async getHistoryItems() {
		/*
    get list of history items
    */
		if (await fs(AI_HISTORY_PATH).exists()) {
			const allFiles = await fs(AI_HISTORY_PATH).lsDir();
			let elems = "";
			for (let i = 0; i < allFiles.length; i++) {
				elems += `<li class="dialog-item" style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 5px;margin-bottom: 5px;border-radius: 8px;font-size:15px;display:flex;flex-direction:row;justify-content:space-between;gap:5px;" data-path="${
					JSON.parse(JSON.stringify(allFiles[i])).url
				}">
                  <p class="history-item">${allFiles[i].name
										.split("__")[0]
										.substring(
											0,
											25
										)}...</p><div><button class="delete-history-btn" style="height:25px;width:25px;border:none;padding:5px;outline:none;border-radius:50%;background:var(--error-text-color);text-align:center;">✗</button></div>
                </li>`;
			}
			return elems;
		} else {
			let elems = "";
			elems = `<li style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 10px;border-radius: 8px;" data-path="#not-available">Not Available</li>`;
			return elems;
		}
	}

	extractUUID(str) {
		// the regex pattern for the UUID
		const uuidPattern =
			/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
		// Use the pattern to match the string
		const match = str.match(uuidPattern);
		// If a match is found, return it; otherwise, return null
		return match ? match[0] : null;
	}

	async displayHistory(url, historyDialogBox) {
		/*
    display selected chat history
    */
		this.$chatBox.innerHTML = "";
		const fileUrl = url.slice(1, url.length - 1);
		const sessionId = this.extractUUID(fileUrl);

		if (!sessionId) {
			this.newChat();
			window.toast("Some error occurred");
			return;
		}
		if (!(await fs(fileUrl).exists())) {
			this.newChat();
			window.toast(
				"Some error occurred or file you trying to open has been deleted"
			);
			return;
		}

		CURRENT_SESSION_FILEPATH = fileUrl;
		try {
			historyDialogBox.hide();
			loader.create("Wait", "Fetching chat history....");
			const fileData = await fs(fileUrl).readFile();
			const responses = JSON.parse(await helpers.decodeText(fileData));
			this.messageHistories = {};
			this.messageHistories[sessionId] = new InMemoryChatMessageHistory();
      let messages = responses.flatMap(pair => [
        new HumanMessage({ content: pair.prompt }),
        new AIMessage({ content: pair.result })
      ]);
      await this.messageHistories[sessionId].addMessages(messages)
			this.messageSessionConfig = {
				configurable: {
					sessionId
				}
			};

			responses.forEach(e => {
			  this.appendUserQuery(e.prompt);
			  this.appendGptResponse(e.result);
			})
			loader.destroy();
		} catch (err) {
			loader.destroy();
			console.error(err.message);
		}
	}

	async myHistory() {
		/*
    show conversation history
    */
		try {
			const historyList = await this.getHistoryItems();
			const content = `<ul>${historyList}</ul>`;
			const historyDialogBox = DialogBox(
				"Conversation History",
				content,
				"Cancel"
			);

			historyDialogBox.onclick(async e => {
				const dialogItem = e.target.closest(".dialog-item");
				const deleteButton = dialogItem.querySelector(".delete-history-btn");
				const historyItem = dialogItem.querySelector(".history-item");
				if (dialogItem.getAttribute("data-path") == "#not-available") {
					return;
				}
				if (!dialogItem.getAttribute("data-path")) {
					return;
				}
				if (e.target === dialogItem || e.target === historyItem) {
					const fileUrl = JSON.stringify(dialogItem.getAttribute("data-path"));
					this.displayHistory(fileUrl, historyDialogBox);
				} else if (e.target === deleteButton) {
					const fileUrl = JSON.stringify(dialogItem.getAttribute("data-path"));
					const url = fileUrl.slice(1, fileUrl.length - 1);

					await fs(dialogItem.getAttribute("data-path")).delete();
					//alert(CURRENT_SESSION_FILEPATH);

					if (CURRENT_SESSION_FILEPATH == url) {
						const chatBox = document.querySelector(".chatBox");
						chatBox.innerHTML = "";
						this.messageHistories = {};
						this.messageSessionConfig = {
							configurable: {
								sessionId: uuidv4()
							}
						};
					}

					dialogItem.remove();
					window.toast("Deleted", 3000);
					CURRENT_SESSION_FILEPATH = null;
				}
			});
		} catch (err) {
			window.alert(err.message);
		}
	}

	async sendQuery() {
		/*
    event on clicking send prompt button of chatgpt 
    */
		const chatText = this.$chatTextarea;
		if (chatText.value != "") {
			this.appendUserQuery(chatText.value);
			this.scrollToBottom();
			this.appendGptResponse("");
			this.loader();
			this.getChatgptResponse(chatText.value);
			chatText.value = "";
		}
	}

	async appendUserQuery(message) {
		/*
    add user query to ui
    */
		try {
			const userAvatar = this.baseUrl + "assets/user_avatar.png";
			const userChatBox = tag("div", { className: "wrapper" });
			const chat = tag("div", { className: "chat" });
			const profileImg = tag("div", {
				className: "profile",
				child: tag("img", {
					src: userAvatar,
					alt: "user"
				})
			});
			const msg = tag("div", {
				className: "message",
				textContent: message
			});
			chat.append(...[profileImg, msg]);
			userChatBox.append(chat);
			this.$chatBox.appendChild(userChatBox);
		} catch (err) {
			window.alert(err);
		}
	}

	async appendGptResponse(message) {
		/*
    add ai response to ui
    */
		const chatgpt_avatar = this.baseUrl + "assets/chatgpt_avatar.svg";
		const gptChatBox = tag("div", { className: "ai_wrapper" });
		const chat = tag("div", { className: "ai_chat" });
		const profileImg = tag("div", {
			className: "ai_profile",
			child: tag("img", {
				src: chatgpt_avatar,
				alt: "ai"
			})
		});
		const msg = tag("div", {
			className: "ai_message"
		});
		msg.innerHTML = this.$mdIt.render(message);
		const copyBtns = msg.querySelectorAll(".copy-button");
		if (copyBtns) {
			for (const copyBtn of copyBtns) {
				copyBtn.addEventListener("click", function () {
					copy(this.dataset.str);
					window.toast("Copied to clipboard", 3000);
				});
			}
		}

		chat.append(...[profileImg, msg]);
		gptChatBox.append(chat);
		this.$chatBox.appendChild(gptChatBox);
	}

	async getChatgptResponse(question) {
		/*
    fetch ai response
    @parm: question {string} - user prompt
    */
		try {
			// get all gptchat element
			const responseBox = Array.from(document.querySelectorAll(".ai_message"));
			const prompt = ChatPromptTemplate.fromMessages([
				[
					"system",
					`You are an AI assistant for the open source plugin AI Assistant for Acode code editor(open source vscode like code editor for Android).`
				],
				["placeholder", "{chat_history}"],
				["human", "{input}"]
			]);
			const parser = new StringOutputParser();
			const chain = prompt.pipe(this.modelInstance).pipe(parser);

			const withMessageHistory = new RunnableWithMessageHistory({
				runnable: chain,
				getMessageHistory: sessionId => {
					if (this.messageHistories[sessionId] === undefined) {
						this.messageHistories[sessionId] = new InMemoryChatMessageHistory();
					}
					return this.messageHistories[sessionId];
				},
				inputMessagesKey: "input",
				historyMessagesKey: "chat_history"
			});

			const stream = await withMessageHistory.stream(
				{
					input: question
				},
				this.messageSessionConfig
			);

			// remove dot loader
			clearInterval(this.$loadInterval);
			const targetElem = responseBox[responseBox.length - 1];
			targetElem.innerHTML = "";
			let result = "";
			// stream the ai responses as plain text
			for await (const chunk of stream) {
				result += chunk;
				targetElem.textContent += chunk;
				this.scrollToBottom();
			}
			// re render the streamed plain text with markdown formatting
			const renderedHtml = this.$mdIt.render(result);
			targetElem.innerHTML = renderedHtml;
			// Attach event listeners to the copy buttons
			const copyBtns = targetElem.querySelectorAll(".copy-button");
			if (copyBtns) {
				for (const copyBtn of copyBtns) {
					copyBtn.addEventListener("click", function () {
						copy(this.dataset.str);
						window.toast("Copied to clipboard", 3000);
					});
				}
			}

			await this.saveHistory();
		} catch (error) {
			// error handling
			const responseBox = Array.from(document.querySelectorAll(".ai_message"));
			clearInterval(this.$loadInterval);
			const targetElem = responseBox[responseBox.length - 1];
			targetElem.innerHTML = "";
			const $errorBox = tag("div", { className: "error-box" });
			if (error.response) {
				$errorBox.innerText = `Status code: ${
					error.response.status
				}\n${JSON.stringify(error.response.data)}`;
			} else {
				$errorBox.innerText = `${error.message}`;
			}
			targetElem.appendChild($errorBox);
		}
	}

	async scrollToBottom() {
		this.$chatBox.scrollTop = this.$chatBox.scrollHeight;
	}

	async loader() {
		/*
    creates dot loader
    */
		// get all gptchat element for loader
		const loadingDots = Array.from(document.querySelectorAll(".ai_message"));
		// made change in last element
		if (loadingDots.length != 0) {
			this.$loadInterval = setInterval(() => {
				loadingDots[loadingDots.length - 1].innerText += "•";
				if (loadingDots[loadingDots.length - 1].innerText == "••••••") {
					loadingDots[loadingDots.length - 1].innerText = "•";
				}
			}, 300);
		}
	}

	async destroy() {
		//sidebarApps.remove("dall-e-ai");
		editorManager.editor.commands.removeCommand("ai_assistant");
		//editorManager.editor.commands.removeCommand("chatgpt_update_token");
		/*window.localStorage.removeItem(window.localStorage.getItem("ai-assistant-provider"));
		window.localStorage.removeItem("ai-assistant-provider");
		window.localStorage.removeItem("ai-assistant-model-name");
		if (await fs(window.DATA_STORAGE+"secret.key").exists()) {
		  await fs(window.DATA_STORAGE+"secret.key").delete();
		}*/
		this.$githubDarkFile.remove();
		this.$higlightJsFile.remove();
		this.$markdownItFile.remove();
		this.$style.remove();
	}
}

if (window.acode) {
	const acodePlugin = new Chatgpt();
	acode.setPluginInit(
		plugin.id,
		(baseUrl, $page, { cacheFileUrl, cacheFile }) => {
			if (!baseUrl.endsWith("/")) {
				baseUrl += "/";
			}
			acodePlugin.baseUrl = baseUrl;
			acodePlugin.init($page, cacheFile, cacheFileUrl);
		}
	);
	acode.setPluginUnmount(plugin.id, () => {
		acodePlugin.destroy();
	});
}
