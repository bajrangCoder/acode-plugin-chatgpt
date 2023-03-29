import plugin from "../plugin.json";
import style from "./style.scss";
import { Configuration, OpenAIApi } from "openai";

const multiPrompt = acode.require('multiPrompt');

class Chatgpt {
  
  async init($page) {
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
    
    $page.id = "acode-plugin-chatgpt";
    $page.settitle("Chat GPT");
    this.$page = $page;
    const menuBtn = tag("span",{
      className:"icon more_vert",
      dataset:{
        action:"toggle-menu"
      }
    });
    menuBtn.addEventListener("click", () => window.toast("Unavailable..\nWait for next update 🥺",4000));
    this.$page.header.append(menuBtn);
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
  
  async updateApiToken(){
    /*
    update chatgpt token
    */
    window.localStorage.removeItem('chatgpt-api-key');
    let newApiToken = await multiPrompt(
      "Enter your openai(chatgpt) key",
      [{
        type:"text",
        id: "token",
        required: true,
        placeholder: "Enter your chatgpt api key"
      }],
      "https://platform.openai.com/account/api-keys"
    );
    window.localStorage.setItem("chatgpt-api-key",newApiToken["token"]);
  }
  
  async run() {
    try{
      let token;
      const myOpenAiToken = window.localStorage.getItem("chatgpt-api-key");
      
      if (myOpenAiToken) {
        token = myOpenAiToken;
      } else {
        let tokenPrompt = await multiPrompt(
          "Enter your openai(chatgpt) key",
          [{
            type:"text",
            id: "token",
            required: true,
            placeholder: "Enter your chatgpt api key"
          }],
          "https://platform.openai.com/account/api-keys"
        );
        token = tokenPrompt["token"];
        window.localStorage.setItem("chatgpt-api-key", token);
      }
      
      this.$openai = new OpenAIApi(new Configuration({apiKey:token}));
      this.$sendBtn.addEventListener("click", this.sendQuery.bind(this))
      this.$page.show();
    }catch(error){
      window.alert(error);
    }
  }
  
  async sendQuery(){
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
  
  async appendUserQuery(message){
    const userAvatar = this.baseUrl + "assets/user_avatar.png";
    const userChatBox = document.createElement("div");
    userChatBox.classList.add("wrapper");
    const markup = `
      <div class="chat">
        <div class="profile"><img src="${userAvatar}" alt="user" /></div>
        <div class="message">${encodeURIComponent(message).replace(/%3C/g,'&lt;').replace(/%3E/g,'&gt;')}</div>
      </div>
    `;
    userChatBox.innerHTML += markup;
    this.$chatBox.appendChild(userChatBox);
  }
  
  async appendGptResponse(message){
    const chatgpt_avatar = this.baseUrl + "assets/chatgpt_avatar.svg";
    const gptChatBox = document.createElement("div");
    gptChatBox.classList.add("ai_wrapper");
    const markup = `
      <div class="ai_chat">
        <div class="ai_profile"><img src="${chatgpt_avatar}" alt="ai" /></div>
        <div class="ai_message">${message}</div>
      </div>
    `;
    gptChatBox.innerHTML += markup;
    this.$chatBox.appendChild(gptChatBox);
  }
  
  async getChatgptResponse(question){
    try{
      try{
        // get all gptchat element 
        const responseBox = Array.from(document.querySelectorAll(".ai_message"));
        const res = await this.$openai.createCompletion({
          model: "text-davinci-003",
          prompt: (question + ((this.$promptsArray.length > 3) ? JSON.stringify(this.$promptsArray.slice(-3)) : JSON.stringify(this.$promptsArray))) , // if array length greater than 3 then send last 3 questions for better max_tokens management
          temperature: 0,
          max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        })
        clearInterval(this.$loadInterval);
        const targetElem =  responseBox[responseBox.length - 1];
        let result = res.data.choices[0].text.trim().toString();
        // adding prompt to array 
        this.$promptsArray.push({
          prevQuestion : question,
          prevResponse : result
        })
        targetElem.innerText = "";
        let index = 0
          
        let typingInterval = setInterval(() => {
          if (index < result.length) {
            targetElem.innerText += result.charAt(index)
            this.scrollToBottom();
            index++
          } else {
            clearInterval(typingInterval)
          }
        }, 30)
      }catch(error){
        const responseBox = Array.from(document.querySelectorAll(".ai_message"));
        clearInterval(this.$loadInterval);
        const targetElem =  responseBox[responseBox.length - 1];
        targetElem.innerText = "";
        if (error.response) {
          targetElem.innerText += `Status code: ${error.response.status}\n`;
          targetElem.innerText += `Error data: ${JSON.stringify(error.response.data)}\n`;
        } else {
          targetElem.innerText += `Error message: ${error.message}\n`;
        }
      }
    }catch(err){
      window.alert(err)
    }
  }
  
  async scrollToBottom(){
    this.$chatBox.scrollTop = this.$chatBox.scrollHeight;
  }
  
  async loader(){
    // get all gptchat element for loader
    const loadingDots = Array.from(document.querySelectorAll(".ai_message"));
    // made change in last element
    if (loadingDots.length != 0) {
      this.$loadInterval = setInterval(() => {
        loadingDots[loadingDots.length - 1].textContent += ".";
        if (loadingDots[loadingDots.length - 1].textContent == "......") {
          loadingDots[loadingDots.length - 1].textContent = ".";
        }
      }, 300);
    }
  }
  
  async destroy() {
    editorManager.editor.commands.removeCommand("chatgpt");
    editorManager.editor.commands.removeCommand("chatgpt_update_token");
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
