import plugin from "../plugin.json";
import style from "./style.scss";

import { Configuration, OpenAIApi } from "openai";
import { base64StringToBlob } from "blob-util";

const multiPrompt = acode.require('multiPrompt');
const fs = acode.require('fs');
const DialogBox = acode.require('dialogBox');
const helpers = acode.require("helpers");
const loader = acode.require("loader");
const sidebarApps = acode.require('sidebarApps');
const toInternalUrl = acode.require('toInternalUrl');


const AI_HISTORY_PATH = window.DATA_STORAGE + "chatgpt";

let CURRENT_SESSION_FILEPATH = null;

class Chatgpt {

  async init($page) {
    // Load external stylesheet and script
    const githubDarkFile = tag("link", {
      rel: "stylesheet",
      href: this.baseUrl + "assets/github-dark.css"
    });
    const higlightJsFile = tag("script", {
      src: this.baseUrl + "assets/highlight.min.js"
    });
    const markdownItFile = tag("script", {
      src: this.baseUrl + "assets/markdown-it.min.js"
    });
    document.head.append(githubDarkFile, higlightJsFile, markdownItFile)

    editorManager.editor.commands.addCommand({
      name: "chatgpt",
      description: "Chat GPT",
      exec: this.run.bind(this),
    });

    // command for updating api key
    editorManager.editor.commands.addCommand({
      name: "chatgpt_update_token",
      description: "Update Chat GPT Token",
      exec: this.updateApiToken.bind(this),
    });

    // add a sidebar app for image generator ai
    acode.addIcon('chatgpt_ai_img', this.baseUrl + 'assets/chatgpt_avatar.svg');
    sidebarApps.add('chatgpt_ai_img', 'dall-e-ai', 'Image Generator AI', (app) => {
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
      this.$sizeSelector.innerHTML = `<optgroup label="Select size of Image">
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
      this.$mainSideBarCont.append(...[headingS, this.$promtArea, this.$sizeSelector, this.$generatorBtn, this.$generatedImg]);
      app.append(this.$mainSideBarCont);
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
    this.$page.header.append(...[newChatBtn, menuBtn]);

    menuBtn.onclick = this.myHistory.bind(this);
    newChatBtn.onclick = this.newChat.bind(this);

    this.$style = tag("style", {
      textContent: style,
    });
    document.head.append(this.$style);
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
    this.$sendBtn.innerHTML = `<img src="${this.baseUrl}assets/send.svg"/>`;
    this.$inputBox.append(...[this.$chatTextarea, this.$sendBtn]);
    mainApp.append(...[this.$inputBox, this.$chatBox])
    this.$page.append(mainApp);
    // array for storing prompts
    this.$promptsArray = [];
  }

  async generateImage() {
    try {
      if(!this.$promtArea.value) {
        acode.alert("Warning","Prompt is required");
        return;
      }
      let token;
      const myOpenAiToken = window.localStorage.getItem("chatgpt-api-key");
      if(myOpenAiToken) {
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
      const $openai = new OpenAIApi(new Configuration({ apiKey: token }));
      loader.create("Wait", "Generating image....");
      const response = await $openai.createImage({
        prompt: this.$promtArea.value,
        n: 1,
        size: this.$sizeSelector.value,
        response_format: "b64_json"
      });
      if(!fs("file:///storage/emulated/0/Download").exists()){
        await fs("file:///storage/emulated/0/").createDirectory("Download");
      }
      const imageBlob = base64StringToBlob(response.data.data[0].b64_json);
      const randomImgName = this.generateRandomName();
      await fs("file:///storage/emulated/0/Download").createFile(randomImgName+".png",imageBlob);
      let newImgUrl = await toInternalUrl("file:///storage/emulated/0/Download/"+randomImgName+".png");
      this.$generatedImg.src = newImgUrl;
      loader.destroy();
      this.$promtArea.value = "file:///storage/emulated/0/Download/"+randomImgName+".png";
      window.toast("Hurray 🎉! Image generated successfully. Image path is given in prompt box.", 3000);
    } catch(error) {
      window.alert(error);
    }
  }
  
  generateRandomName() {
    const timestamp = Date.now().toString();
    const randomString = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${randomString}`;
  }

  async run() {
    try {
      let token;
      const myOpenAiToken = window.localStorage.getItem("chatgpt-api-key");
      if(myOpenAiToken) {
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
        highlight: function(str, lang) {
          let html = `<pre class="hljs" style="border: 2px solid var(--border-color);box-sizing:border-box;width:calc(100vw - 5.8rem);margin-right:5px;border-radius:5px;padding:13px;overflow: auto;"><code>${hljs.highlightAuto(str).value}</code></pre>`;
          return html;
        }
      });
      this.$sendBtn.addEventListener("click", this.sendQuery.bind(this))

      this.$page.show();
    } catch(error) {
      window.alert(error);
    }
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
  }

  // new chat 
  async saveHistory() {
    try {
      if(!this.$promptsArray.length) {
        return;
      }
      if(CURRENT_SESSION_FILEPATH == null) {
        try {
          const uniqueName = `${this.$promptsArray[0].prevQuestion.substring(0, 30)}.json`;
          //const content = JSON.stringify(this.$promptsArray);

          if(!await fs(AI_HISTORY_PATH).exists()) {
            await fs(window.DATA_STORAGE).createDirectory("chatgpt");
          }

          CURRENT_SESSION_FILEPATH = await fs(AI_HISTORY_PATH).createFile(uniqueName, this.$promptsArray);

        } catch(err) {
          alert(err.message);
        }
      } else {
        try {
          CURRENT_SESSION_FILEPATH = await fs(CURRENT_SESSION_FILEPATH).writeFile(this.$promptsArray);
        } catch(err) {
          alert(err.message);
        }
      }
    } catch(err) {
      window.alert(err);
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
    get lost of history items
    */
    if(await fs(AI_HISTORY_PATH).exists()) {
      const allFiles = await fs(AI_HISTORY_PATH).lsDir();
      let elems = "";
      for(let i = 0; i < allFiles.length; i++) {
        elems += `<li class="dialog-item" style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 5px;margin-bottom: 5px;border-radius: 8px;font-size:15px;display:flex;flex-direction:row;justify-content:space-between;gap:5px;" data-path="${JSON.parse(JSON.stringify(allFiles[i])).url}">
                  <p class="history-item" style="">${JSON.parse(JSON.stringify(allFiles[i])).name.split(".")[0]}</p><div><button class="delete-history-btn" style="height:25px;width:25px;border:none;padding:5px;outline:none;border-radius:50%;background:var(--error-text-color);text-align:center;">✗</button></div>
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
    } catch(err) {
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
        if(dialogItem.getAttribute("data-path") == "#not-available") {
          return;
        }
        if(!dialogItem.getAttribute("data-path")) {
          return;
        }
        if(e.target === dialogItem || e.target === historyItem) {
          const fileUrl = JSON.stringify(dialogItem.getAttribute("data-path"));
          this.displayHistory(fileUrl, historyDialogBox);
        } else if(e.target === deleteButton) {
          await fs(dialogItem.getAttribute("data-path")).delete();
          dialogItem.remove();
          window.toast("Deleted", 3000);
          this.newChat();
        }
      });
    } catch(err) {
      window.alert(err)
    }
  }

  async sendQuery() {
    const chatText = this.$chatTextarea;
    if(chatText.value != "") {
      this.appendUserQuery(chatText.value);
      this.scrollToBottom();
      this.appendGptResponse("");
      this.loader();
      this.getChatgptResponse(chatText.value);
      chatText.value = "";
    }
  }

  async appendUserQuery(message) {
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
    } catch(err) {
      window.alert(err)
    }
  }

  async appendGptResponse(message) {
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
    chat.append(...[profileImg, msg]);
    gptChatBox.append(chat);
    this.$chatBox.appendChild(gptChatBox);
  }

  async getChatgptResponse(question) {
    try {
      try {
        // get all gptchat element 
        const responseBox = Array.from(document.querySelectorAll(".ai_message"));
        const arrMessage = this.$promptsArray > 0 ?
          this.$promptsArray.map(({ prevQuestion, prevResponse }) => ({
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
        clearInterval(this.$loadInterval);
        const targetElem = responseBox[responseBox.length - 1];
        let result = res.data.choices[0].message.content;

        // adding prompt to array 
        this.$promptsArray.push({
          prevQuestion: question,
          prevResponse: result,
        })
        this.saveHistory();

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
        this.scrollToBottom();
      } catch(error) {
        const responseBox = Array.from(document.querySelectorAll(".ai_message"));
        clearInterval(this.$loadInterval);
        const targetElem = responseBox[responseBox.length - 1];
        targetElem.innerText = "";
        if(error.response) {
          targetElem.innerText += `Status code: ${error.response.status}\n`;
          targetElem.innerText += `Error data: ${JSON.stringify(error.response.data)}\n`;
        } else {
          targetElem.innerText += `Error message: ${error.message}\n`;
        }
      }
    } catch(err) {
      window.alert(err)
    }
  }

  async scrollToBottom() {
    this.$chatBox.scrollTop = this.$chatBox.scrollHeight;
  }

  async loader() {
    // get all gptchat element for loader
    const loadingDots = Array.from(document.querySelectorAll(".ai_message"));
    // made change in last element
    if(loadingDots.length != 0) {
      this.$loadInterval = setInterval(() => {
        loadingDots[loadingDots.length - 1].innerText += "•";
        if(loadingDots[loadingDots.length - 1].innerText == "••••••") {
          loadingDots[loadingDots.length - 1].innerText = "•";
        }
      }, 300);
    }
  }

  async destroy() {
    editorManager.editor.commands.removeCommand("chatgpt");
    editorManager.editor.commands.removeCommand("chatgpt_update_token");
  }
}

if(window.acode) {
  const acodePlugin = new Chatgpt();
  acode.setPluginInit(
    plugin.id,
    (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
      if(!baseUrl.endsWith("/")) {
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
