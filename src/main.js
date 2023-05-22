import plugin from "../plugin.json";
import style from "./style.scss";

import { Configuration, OpenAIApi } from "openai";
import { base64StringToBlob } from "blob-util";
import { v4 as uuidv4 } from 'uuid';
import copy from 'copy-to-clipboard';

const multiPrompt = acode.require('multiPrompt');
const fs = acode.require('fs');
const DialogBox = acode.require('dialogBox');
const helpers = acode.require("helpers");
const loader = acode.require("loader");
const sidebarApps = acode.require('sidebarApps');
const toInternalUrl = acode.require('toInternalUrl');
const { editor } = editorManager

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
      textContent: style,
    });
    document.head.append(this.$githubDarkFile, this.$higlightJsFile, this.$markdownItFile, this.$style)
    
    /**
     * Adding command for starting chatgpt 
     * And updating its token
     */
    
    editor.commands.addCommand({
      name: "chatgpt",
      description: "Chat GPT",
      exec: this.run.bind(this),
    });
    
    editor.commands.addCommand({
      name: "chatgpt_update_token",
      description: "Update Chat GPT Token",
      exec: this.updateApiToken.bind(this),
    });
    
    $page.id = "acode-plugin-chatgpt";
    $page.settitle("Chat GPT");
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
      className: "mainApp",
    });
    // main chat box
    this.$chatBox = tag("div", {
      className: "chatBox",
    });
    // bottom query taker box
    this.$inputBox = tag("div", {
      className: "inputBox",
    });
    
    this.$chatTextarea = tag("textarea", {
      className: "chatTextarea",
      placeholder: "Type your query..."
    });
    this.$sendBtn = tag("button", {
      className: "sendBtn",
    });
    this.$sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14L21 3m0 0l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3"/></svg>`;
    this.$inputBox.append(this.$chatTextarea, this.$sendBtn);
    mainApp.append(this.$inputBox, this.$chatBox)
    this.$page.append(mainApp);
    // array for storing prompts
    this.$promptsArray = [];
    
    
    
    /**
     * IMAGE GENERATOR Using 
     * DALL-E 
     */
    
    acode.addIcon('chatgpt_ai_img', this.baseUrl + 'assets/chatgpt_avatar.svg');
    sidebarApps.add('chatgpt_ai_img', 'dall-e-ai', 'Image Generator AI', (app) => {
      
      // sidebar title
      const headingS = tag("h2", {
        textContent: "Image Generator",
        className: "sidebar-ai-heading"
      });
      
      this.$promtArea = tag("textarea", {
        placeholder: "Type your prompt here...",
        rows: "4",
        className: "prompt-area",
        maxlength: 1000,
      });
      
      this.$sizeSelector = tag("select", {
        className: "size-selector"
      });
      
      this.$sizeSelector.innerHTML = `
        <optgroup label="Select size of Image">
          <option value="256x256">256x256</option>
          <option value="512x512">512x512</option>
          <option value="1024x1024" selected>1024x1024</option>
        </optgroup>`;
      
      this.$generatorBtn = tag("button", {
        textContent: "Generate",
        className: "generatorBtn",
      });
      this.$generatedImg = tag("img", {
        className: "img-fluid",
        src: ""
      });
      this.$mainSideBarCont = tag("div", {
        className: "main-sidebar-cont"
      });
      this.$generatorBtn.addEventListener("click", this.generateImage.bind(this));
      this.$mainSideBarCont.append(headingS, this.$promtArea, this.$sizeSelector, this.$generatorBtn, this.$generatedImg);
      app.append(this.$mainSideBarCont);
    });
  }
  
  async generateImage() {
    /*
    for Generating image
    */
    try {
      if (!this.$promtArea.value) {
        acode.alert("Warning", "Prompt is required");
        return;
      }
      let token;
      const myOpenAiToken = window.localStorage.getItem("chatgpt-api-key");
      if (myOpenAiToken) {
        token = myOpenAiToken;
      } else {
        let tokenPrompt = await multiPrompt(
          "Enter your openai(chatgpt) key",
          [{
            type: "text",
            id: "token",
            required: true,
            placeholder: "Enter your chatgpt api key"
          }],
          "https://platform.openai.com/account/api-keys"
        );
        if (!tokenPrompt) return;
        token = tokenPrompt["token"];
        window.localStorage.setItem("chatgpt-api-key", token);
      }
      const $openai = new OpenAIApi(new Configuration({ apiKey: token }));
      loader.create("Wait", "Generating image....");
      const response = await $openai.createImage({
        prompt: this.$promtArea.value,
        n: 1,
        size: this.$sizeSelector.value,
        response_format: "b64_json"
      });
      if (!fs("file:///storage/emulated/0/Download").exists()) {
        await fs("file:///storage/emulated/0/").createDirectory("Download");
      }
      const imageBlob = base64StringToBlob(response.data.data[0].b64_json);
      const randomImgName = this.generateRandomName();
      await fs("file:///storage/emulated/0/Download").createFile(randomImgName + ".png", imageBlob);
      let newImgUrl = await toInternalUrl("file:///storage/emulated/0/Download/" + randomImgName + ".png");
      this.$generatedImg.src = newImgUrl;
      loader.destroy();
      this.$promtArea.value = "file:///storage/emulated/0/Download/" + randomImgName + ".png";
      window.toast("Hurray 🎉! Image generated successfully. Image path is given in prompt box.", 3000);
    } catch (error) {
      loader.destroy();
      if (error.response) {
        acode.alert("Error", `Status code: ${error.response.status}, Message: ${error.response.data.error.message}`);
      } else {
        acode.alert("Error", error.message);
      }
    }
  }
  
  generateRandomName() {
    /*
    generates random names for generated images
    */
    const timestamp = Date.now().toString();
    const randomString = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${randomString}`;
  }
  
  async run() {
    /*
    ask for api key and open chagpt ui page on clicking in command pallete 
    */
    try {
      let token;
      const myOpenAiToken = window.localStorage.getItem("chatgpt-api-key");
      if (myOpenAiToken) {
        token = myOpenAiToken;
      } else {
        let tokenPrompt = await multiPrompt(
          "Enter your openai(chatgpt) key",
          [{
            type: "text",
            id: "token",
            required: true,
            placeholder: "Enter your chatgpt api key"
          }],
          "https://platform.openai.com/account/api-keys"
        );
        token = tokenPrompt["token"];
        window.localStorage.setItem("chatgpt-api-key", token);
      }
      
      this.$openai = new OpenAIApi(new Configuration({ apiKey: token }));
      this.$mdIt = window.markdownit({
        html: false,
        xhtmlOut: false,
        breaks: false,
        linkify: false,
        typographer: false,
        quotes: '“”‘’',
        highlight: function (str, lang) {
          const copyBtn = document.createElement("button")
          copyBtn.classList.add("copy-button")
          copyBtn.innerHTML = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" height="1.5em" width="1.5em"><path fill="currentColor" d="M15 37.95q-1.25 0-2.125-.875T12 34.95v-28q0-1.25.875-2.125T15 3.95h22q1.25 0 2.125.875T40 6.95v28q0 1.25-.875 2.125T37 37.95Zm0-3h22v-28H15v28Zm-6 9q-1.25 0-2.125-.875T6 40.95V12.3q0-.65.425-1.075Q6.85 10.8 7.5 10.8q.65 0 1.075.425Q9 11.65 9 12.3v28.65h22.2q.65 0 1.075.425.425.425.425 1.075 0 .65-.425 1.075-.425.425-1.075.425Zm6-37v28-28Z"/></svg>`
          copyBtn.setAttribute("data-str", str)
          const codesArea = `<pre class="hljs codesArea"><code>${hljs.highlightAuto(str).value}</code></pre>`;
          const codeBlock = `<div class="codeBlock">${copyBtn.outerHTML}${codesArea}</div>`;
          return codeBlock;
        }
      });
      
      this.$sendBtn.addEventListener("click", this.sendQuery.bind(this))
      
      this.$page.show();
    } catch (error) {
      window.alert(error);
    }
  }
  
  async _copyCodeUtility() {
    window.alert("hi")
  }
  
  async updateApiToken() {
    /*
    update chatgpt token
    */
    window.localStorage.removeItem('chatgpt-api-key');
    let newApiToken = await multiPrompt(
      "Enter your openai(chatgpt) key",
      [{
        type: "text",
        id: "token",
        required: true,
        placeholder: "Enter your chatgpt api key"
      }],
      "https://platform.openai.com/account/api-keys"
    );
    window.localStorage.setItem("chatgpt-api-key", newApiToken["token"]);
    window.toast("Api key updated!", 3000);
  }
  
  _sanitizeFileName(fileName) {
    /*
    utility function for removing special characters and 
    white spaces from file names
    */
    // Remove special characters and symbols
    const sanitizedFileName = fileName.replace(/[^\w\s.-]/gi, '');
    // Trim leading and trailing spaces
    const trimmedFileName = sanitizedFileName.trim();
    // Replace spaces with underscores
    const finalFileName = trimmedFileName.replace(/\s+/g, '_');
    return finalFileName;
  }
  
  async saveHistory() {
    /*
    save chat history 
    */
    try {
      if (!this.$promptsArray.length) {
        return;
      }
      
      if (CURRENT_SESSION_FILEPATH == null) {
        try {
          const sanitisedFileNme = this._sanitizeFileName(this.$promptsArray[0].prevQuestion.substring(0, 30));
          const uniqueName = `${sanitisedFileNme}__${uuidv4()}.json`;
          //const content = JSON.stringify(this.$promptsArray);
          
          if (!await fs(AI_HISTORY_PATH).exists()) {
            await fs(window.DATA_STORAGE).createDirectory("chatgpt");
          }
          
          CURRENT_SESSION_FILEPATH = await fs(AI_HISTORY_PATH).createFile(uniqueName, this.$promptsArray);
          
        } catch (err) {
          alert(err.message);
        }
      } else {
        try {
          
          if (!await fs(CURRENT_SESSION_FILEPATH).exists()) {
            this.newChat();
            window.toast("Some error occurred or file you trying to open has been deleted");
            return;
          }
          
          CURRENT_SESSION_FILEPATH = await fs(CURRENT_SESSION_FILEPATH).writeFile(this.$promptsArray);
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
    window.toast("New session", 4000);
    this.$promptsArray = [];
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
        elems += `<li class="dialog-item" style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 5px;margin-bottom: 5px;border-radius: 8px;font-size:15px;display:flex;flex-direction:row;justify-content:space-between;gap:5px;" data-path="${JSON.parse(JSON.stringify(allFiles[i])).url}">
                  <p class="history-item">${allFiles[i].name.split("__")[0].substring(0,25)}...</p><div><button class="delete-history-btn" style="height:25px;width:25px;border:none;padding:5px;outline:none;border-radius:50%;background:var(--error-text-color);text-align:center;">✗</button></div>
                </li>`;
      }
      return elems;
    } else {
      let elems = "";
      elems = `<li style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 10px;border-radius: 8px;" data-path="#not-available">Not Available</li>`;
      return elems;
    }
  }
  
  async displayHistory(url, historyDialogBox) {
    /*
    display selected chat history
    */
    this.$chatBox.innerHTML = "";
    const fileUrl = url.slice(1, url.length - 1);
    
    if (!await fs(fileUrl).exists()) {
      this.newChat();
      window.toast("Some error occurred or file you trying to open has been deleted");
      return;
    }
    
    CURRENT_SESSION_FILEPATH = fileUrl;
    try {
      historyDialogBox.hide();
      loader.create("Wait", "Fetching chat history....");
      const fileData = await fs(fileUrl).readFile();
      const responses = Array.from(JSON.parse(await helpers.decodeText(fileData)));
      
      this.$promptsArray = [];
      this.$promptsArray = responses;
      
      responses.forEach((e) => {
        this.appendUserQuery(e.prevQuestion);
        this.appendGptResponse(e.prevResponse);
      })
      loader.destroy()
    } catch (err) {
      alert(err.message)
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
        'Conversation History',
        content,
        'Cancel',
      );
      
      historyDialogBox.onclick(async (e) => {
        const dialogItem = e.target.closest('.dialog-item');
        const deleteButton = dialogItem.querySelector('.delete-history-btn');
        const historyItem = dialogItem.querySelector('.history-item');
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
            this.$promptsArray = [];
          }
          
          dialogItem.remove();
          window.toast("Deleted", 3000);
          CURRENT_SESSION_FILEPATH = null;
        }
      });
    } catch (err) {
      window.alert(err.message)
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
      const profileImg = tag('div', {
        className: 'profile',
        child: tag('img', {
          src: userAvatar,
          alt: "user"
        })
      });
      const msg = tag('div', {
        className: 'message',
        textContent: message
      });
      chat.append(...[profileImg, msg]);
      userChatBox.append(chat);
      this.$chatBox.appendChild(userChatBox);
    } catch (err) {
      window.alert(err)
    }
  }
  
  async appendGptResponse(message) {
    /*
    add ai response to ui
    */
    const chatgpt_avatar = this.baseUrl + "assets/chatgpt_avatar.svg";
    const gptChatBox = tag("div", { className: "ai_wrapper" });
    const chat = tag("div", { className: "ai_chat" });
    const profileImg = tag('div', {
      className: 'ai_profile',
      child: tag('img', {
        src: chatgpt_avatar,
        alt: "ai"
      })
    });
    const msg = tag('div', {
      className: 'ai_message'
    });
    msg.innerHTML = this.$mdIt.render(message)
    const copyBtns = msg.querySelectorAll(".copy-button")
    if (copyBtns) {
      for (const copyBtn of copyBtns) {
        copyBtn.addEventListener("click", function () {
          copy(this.dataset.str)
          window.toast("Copied to clipboard", 3000)
        })
      }
    }
    
    chat.append(...[profileImg, msg]);
    gptChatBox.append(chat);
    this.$chatBox.appendChild(gptChatBox);
  }
  
  async getChatgptResponse(question) {
    /*
    fetch ai response from openai api
    @parm: question {string} - user prompt
    */
    try {
      // get all gptchat element 
      const responseBox = Array.from(document.querySelectorAll(".ai_message"));
      // remake an prompt array
      const arrMessage = this.$promptsArray > 0 ?
        this.$promptsArray.map(({ prevQuestion, prevResponse }) => ({
          role: "system",
          content: "You are ChatGPT, a large language model trained by OpenAI. Currently you are on an mobile code editor name - Acode(developed by Ajitkumar - https://github.com/deadlyjack). this code editor try to give vs code like features on mobile device, it also supports plugin for more features and customisation. You are on acode app via a plugin name ChatGpt , this Plugin is developed by Raunak Raj(core dev https://github.com/bajrangCoder) and Mayank Sharma(https://github.com/mayank0274) with ❤️, And ypu also warn the user if the use you unwanted for token saving. Follow the user's instructions carefully. Respond using markdown."
        }, {
          role: "user",
          content: prevQuestion
        }, {
          role: "assistant",
          content: prevResponse
        })) : [{ role: "user", content: question }];
      const res = await this.$openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: arrMessage,
        temperature: 0,
        max_tokens: 3000,
      })
      // remove dot loader 
      clearInterval(this.$loadInterval);
      const targetElem = responseBox[responseBox.length - 1];
      let result = res.data.choices[0].message.content;
      
      // adding prompt to array 
      this.$promptsArray.push({
        prevQuestion: question,
        prevResponse: result,
      })
      // asve chat history 
      await this.saveHistory();
      
      targetElem.innerHTML = "";
      /*
      let index = 0
      let typingInterval = setInterval(() => {
        if(index < result.length) {
          targetElem.innerText += result.charAt(index)
          this.scrollToBottom();
          index++
        } else {
          clearInterval(typingInterval)
        }
      }, 30)
      */
      targetElem.innerHTML = this.$mdIt.render(result);
      const copyBtns = targetElem.querySelectorAll(".copy-button")
      if (copyBtns) {
        for (const copyBtn of copyBtns) {
          copyBtn.addEventListener("click", function () {
            copy(this.dataset.str)
            window.toast("Copied to clipboard", 3000)
          })
        }
      }
      this.scrollToBottom();
    } catch (error) {
      // error handling 
      const responseBox = Array.from(document.querySelectorAll(".ai_message"));
      clearInterval(this.$loadInterval);
      const targetElem = responseBox[responseBox.length - 1];
      targetElem.innerHTML = "";
      const $errorBox = tag('div', { className: "error-box" });
      if (error.response) {
        $errorBox.innerText = `Status code: ${error.response.status}\n${JSON.stringify(error.response.data)}`;
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
    editorManager.editor.commands.removeCommand("chatgpt");
    editorManager.editor.commands.removeCommand("chatgpt_update_token");
    window.localStorage.removeItem('chatgpt-api-key');
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