import plugin from "../plugin.json";
import style from "./style.scss";

import { Configuration,OpenAIApi } from "openai";

const multiPrompt=acode.require('multiPrompt');
const fs=acode.require('fs');
const DialogBox=acode.require('dialogBox');
const helpers=acode.require("helpers");

const AI_HISTORY_PATH=window.DATA_STORAGE+"chatgpt";

let CURRENT_SESSION_FILEPATH=null;

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

    $page.id="acode-plugin-chatgpt";
    $page.settitle("Chat GPT");
    this.$page=$page;
    const menuBtn=tag("span",{
      className: "icon more_vert",
      dataset: {
        action: "toggle-menu"
      }
    });

    // button for new chat
    const newChatBtn=tag("span",{
      className: "icon add",
      dataset: {
        action: "new-chat"
      }
    });
    this.$page.header.append(...[newChatBtn,menuBtn]);

    menuBtn.onclick=this.myHistory.bind(this);
    newChatBtn.onclick=this.newChat.bind(this);

    this.$style=tag("style",{
      textContent: style,
    });
    document.head.append(this.$style);
    const mainApp=tag("div",{
      className: "mainApp",
    });
    // main chat box
    this.$chatBox=tag("div",{
      className: "chatBox",
    });
    // bottom query taker box
    this.$inputBox=tag("div",{
      className: "inputBox",
    });

    this.$chatTextarea=tag("textarea",{
      className: "chatTextarea",
      placeholder: "Type your query..."
    });
    this.$sendBtn=tag("button",{
      className: "sendBtn",
    });
    this.$sendBtn.innerHTML=`<img src="${this.baseUrl}assets/send.svg"/>`;
    this.$inputBox.append(...[this.$chatTextarea,this.$sendBtn]);
    mainApp.append(...[this.$inputBox,this.$chatBox])
    this.$page.append(mainApp);

    // array for storing prompts
    this.$promptsArray=[];
  }

  async updateApiToken() {
    /*
    update chatgpt token
    */
    window.localStorage.removeItem('chatgpt-api-key');
    let newApiToken=await multiPrompt(
      "Enter your openai(chatgpt) key",
      [{
        type: "text",
        id: "token",
        required: true,
        placeholder: "Enter your chatgpt api key"
      }],
      "https://platform.openai.com/account/api-keys"
    );
    window.localStorage.setItem("chatgpt-api-key",newApiToken["token"]);
  }

  // new chat 
  async saveHistory() {
    try {
      if(!this.$promptsArray.length) {
        return;
      }
      if(CURRENT_SESSION_FILEPATH==null) {
        try {
          const uniqueName=`${this.$promptsArray[0].prevQuestion.substring(0,30)}.json`;
          const content=JSON.stringify(this.$promptsArray);

          if(!await fs(AI_HISTORY_PATH).exists()) {
            await fs(window.DATA_STORAGE).createDirectory("chatgpt");
          }

          CURRENT_SESSION_FILEPATH=await fs(AI_HISTORY_PATH).createFile(uniqueName,content);

        } catch(err) {
          alert(err.message);
        }
      } else {
        try {
          CURRENT_SESSION_FILEPATH=await fs(CURRENT_SESSION_FILEPATH).writeFile(this.$promptsArray);
        } catch(err) {
          alert(err.message);
        }
      }
    } catch(err) {
      window.alert(err);
    }
  }

  // new chat 

  newChat() {
    this.$chatBox.innerHTML="";
    window.toast("New session",4000);
    this.$promptsArray=[];
    CURRENT_SESSION_FILEPATH=null;
  }

  // get history 
  async getHistoryItems() {
    if(await fs(AI_HISTORY_PATH).exists()) {
      const allFiles=await fs(AI_HISTORY_PATH).lsDir();
      let elems="";
      for(let i=0;i<allFiles.length;i++) {
        elems+=`<li style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 5px;margin-bottom: 5px;border-radius: 8px;font-size:16px;" data-path="${JSON.parse(JSON.stringify(allFiles[i])).url}">
                  ${JSON.parse(JSON.stringify(allFiles[i])).name.split(".")[0]}
                </li>`;
      }
      return elems;
    } else {
      let elems="";
      elems=`<li style="background: var(--secondary-color);color: var(--secondary-text-color);padding: 10px;border-radius: 8px;" data-path="#not-available">Not Available</li>`;
      return elems;
    }
  }

  // display history data 
  async displayHistory(url,historyDialogBox) {
    this.$chatBox.innerHTML="";
    const fileUrl=url.slice(1,url.length-1);
    try {
      const fileData=await fs(fileUrl).readFile();
      const responses=Array.from(JSON.parse(await helpers.decodeText(fileData)));
      historyDialogBox.hide();
      responses.forEach((e) => {
        this.appendUserQuery(e.prevQuestion);
        this.appendGptResponse(e.prevResponse);
      })
    } catch(err) {
      alert(err.message)
    }
  }

  // show history 
  async myHistory() {
    try{
      const historyList=await this.getHistoryItems();
      const content=`<ul>${historyList}</ul>`;
      const historyDialogBox=DialogBox(
        'Conversation History',
        content,
        'Cancel',
      );
  
      historyDialogBox.onclick((e) => {
        const targetElem = e.target;
        
        
        
        if(targetElem.getAttribute("data-path")=="#not-available") {
          return;
        }
        if(!targetElem.getAttribute("data-path")){
          return;
        }
        const fileUrl=JSON.stringify(targetElem.getAttribute("data-path"));
        this.displayHistory(fileUrl,historyDialogBox);
      });
    }catch(err){
      window.alert(err)
    }
  }
  
  async run() {
    try {
      let token;
      const myOpenAiToken=window.localStorage.getItem("chatgpt-api-key");

      if(myOpenAiToken) {
        token=myOpenAiToken;
      } else {
        let tokenPrompt=await multiPrompt(
          "Enter your openai(chatgpt) key",
          [{
            type: "text",
            id: "token",
            required: true,
            placeholder: "Enter your chatgpt api key"
          }],
          "https://platform.openai.com/account/api-keys"
        );
        token=tokenPrompt["token"];
        window.localStorage.setItem("chatgpt-api-key",token);
      }

      this.$openai=new OpenAIApi(new Configuration({ apiKey: token }));
      this.$sendBtn.addEventListener("click",this.sendQuery.bind(this))
      this.$page.show();
    } catch(error) {
      window.alert(error);
    }
  }

  async sendQuery() {
    const chatText=this.$chatTextarea;
    if(chatText.value!="") {
      this.appendUserQuery(chatText.value);
      this.scrollToBottom();
      this.appendGptResponse("");
      this.loader();
      this.getChatgptResponse(chatText.value);
      chatText.value="";
    }
  }

  async appendUserQuery(message) {
    try {
      const userAvatar=this.baseUrl+"assets/user_avatar.png";
      const userChatBox=tag("div",{ className: "wrapper" });
      const chat=tag("div",{ className: "chat" });
      const profileImg=tag('div',{
        className: 'profile',
        child: tag('img',{
          src: userAvatar,
          alt: "user"
        })
      });
      const msg=tag('div',{
        className: 'message',
        textContent: message
      });
      chat.append(...[profileImg,msg]);
      userChatBox.append(chat);
      this.$chatBox.appendChild(userChatBox);
    } catch(err) {
      window.alert(err)
    }
  }

  async appendGptResponse(message) {
    const chatgpt_avatar=this.baseUrl+"assets/chatgpt_avatar.svg";
    const gptChatBox=tag("div",{ className: "ai_wrapper" });
    const chat=tag("div",{ className: "ai_chat" });
    const profileImg=tag('div',{
      className: 'ai_profile',
      child: tag('img',{
        src: chatgpt_avatar,
        alt: "ai"
      })
    });
    const msg=tag('div',{
      className: 'ai_message',
      textContent: message
    });
    chat.append(...[profileImg,msg]);
    gptChatBox.append(chat);
    this.$chatBox.appendChild(gptChatBox);
  }

  async getChatgptResponse(question) {
    try {
      try {
        // get all gptchat element 
        const responseBox=Array.from(document.querySelectorAll(".ai_message"));
        const res=await this.$openai.createCompletion({
          model: "text-davinci-003",
          prompt: (question+((this.$promptsArray.length>3)? JSON.stringify(this.$promptsArray.slice(-3)):JSON.stringify(this.$promptsArray))), // if array length greater than 3 then send last 3 questions for better max_tokens management
          temperature: 0,
          max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        })
        clearInterval(this.$loadInterval);
        const targetElem=responseBox[responseBox.length-1];
        let result=res.data.choices[0].text.trim().toString();
        // adding prompt to array 
        this.$promptsArray.push({
          prevQuestion: question,
          prevResponse: result,
        })
        this.saveHistory();

        targetElem.innerText="";
        let index=0

        let typingInterval=setInterval(() => {
          if(index<result.length) {
            targetElem.innerText+=result.charAt(index)
            this.scrollToBottom();
            index++
          } else {
            clearInterval(typingInterval)
          }
        },30)
      } catch(error) {
        const responseBox=Array.from(document.querySelectorAll(".ai_message"));
        clearInterval(this.$loadInterval);
        const targetElem=responseBox[responseBox.length-1];
        targetElem.innerText="";
        if(error.response) {
          targetElem.innerText+=`Status code: ${error.response.status}\n`;
          targetElem.innerText+=`Error data: ${JSON.stringify(error.response.data)}\n`;
        } else {
          targetElem.innerText+=`Error message: ${error.message}\n`;
        }
      }
    } catch(err) {
      window.alert(err)
    }
  }

  async scrollToBottom() {
    this.$chatBox.scrollTop=this.$chatBox.scrollHeight;
  }

  async loader() {
    // get all gptchat element for loader
    const loadingDots=Array.from(document.querySelectorAll(".ai_message"));
    // made change in last element
    if(loadingDots.length!=0) {
      this.$loadInterval=setInterval(() => {
        loadingDots[loadingDots.length-1].textContent+=".";
        if(loadingDots[loadingDots.length-1].textContent=="......") {
          loadingDots[loadingDots.length-1].textContent=".";
        }
      },300);
    }
  }

  async destroy() {
    editorManager.editor.commands.removeCommand("chatgpt");
    editorManager.editor.commands.removeCommand("chatgpt_update_token");
  }
}

if(window.acode) {
  const acodePlugin=new Chatgpt();
  acode.setPluginInit(
    plugin.id,
    (baseUrl,$page,{ cacheFileUrl,cacheFile }) => {
      if(!baseUrl.endsWith("/")) {
        baseUrl+="/";
      }
      acodePlugin.baseUrl=baseUrl;
      acodePlugin.init($page,cacheFile,cacheFileUrl);
    }
  );
  acode.setPluginUnmount(plugin.id,() => {
    acodePlugin.destroy();
  });
}