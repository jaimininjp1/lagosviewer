var viewer;
var options = {
    env: 'AutodeskProduction',
    getAccessToken: getForgeToken
};
var documentId = 'urn:dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLlhfMTV4Z19TUS1ldDh3YUpfcVkxNVE_dmVyc2lvbj0x';

Autodesk.Viewing.Initializer(options, () => {
    viewer = new Autodesk.Viewing.Private.GuiViewer3D(document.getElementById('forgeViewer'), 
        { loaderExtensions: { svf: "Autodesk.MemoryLimited" } });
    viewer.start();
    viewer.setOptimizeNavigation(true);
    viewer.forEachExtension(function (ext) {
        console.log("Extension ID:" + ext.id);
    });

    viewer.loadExtension("Autodesk.BIM360.Extension.PushPin");
    viewer.loadExtension("BIM360IssueExtension");
        
    Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);

});

function getForgeToken(callback) {
  fetch('forge/oauth/tokenForge_2Legs').then(res => {
    res.json().then(data => {
        console.log("Token api called");
        var token = data.access_token;
        var expire = data.expires_in;
        callback(token, expire);
    });
  });
}

function getThreeLeggedToken(callback) {
    var refresh = sessionStorage.getItem("refreshToken");
    fetch('Home/refreshToken?token='+refresh).then(res => {
        res.json().then(data => {
            
            var token = JSON.parse(data).access_token;
            var refreshToken = JSON.parse(data).refresh_token;
            var expire = JSON.parse(data).expires_in;
            
            sessionStorage.setItem("refreshToken", refreshToken);
            sessionStorage.setItem("bimToken", token);
            callback(token, expire);

        });
      });
}

function refreshBimDocToken() {
    var refresh = sessionStorage.getItem("refreshToken");
    fetch('Home/refreshToken?token='+refresh).then(res => {
        res.json().then(data => {
            
            var token = JSON.parse(data).access_token;
            var refreshToken = JSON.parse(data).refresh_token;
            var expire = JSON.parse(data).expires_in;
            
            sessionStorage.setItem("refreshToken", refreshToken);
            sessionStorage.setItem("bimToken", token);

        });
      });
}

function onDocumentLoadSuccess(doc) {

    var viewables = doc.getRoot().getDefaultGeometry();
    viewer.loadDocumentNode(doc, viewables).then(i => {
        loginToBim360();
    });
    
}

function loginToBim360() {
    var tkn = sessionStorage.getItem("refreshToken");
    if(tkn != null && tkn!="undefined" && typeof tkn != "undefined") {
        console.log("Token found.");
        refreshBimDocToken();
        BIM360IssueExtension.prototype.loadIssues();
    } else {
        sessionStorage.removeItem("refreshToken");
        sessionStorage.removeItem("expire");
        sessionStorage.removeItem("bimToken");
        var url = "https://developer.api.autodesk.com//authentication/v1/authorize?"
        +"client_id=QsqosEk9aHS6VIdEWrfgPBiOBBqFHB5r&response_type=code&redirect_uri="
        +"https://lagosviewer.herokuapp.com/forge/oauth/tokenForge_3Legs&scope=data:read%20data:write%20data:create%20data:search%20code:all%20account:read%20user-profile:read%20viewables:read";
        var left = (screen.width / 2) - (650 / 2);
        var top = (screen.height / 3) - (600 / 2);
        var newWindow = window.open(url, 'Logon to your BIM360 account.', 'height=600,width=650,top=' + top + ',left=' + left);

        startCheckingLogin();
        if (window.focus) {
            newWindow.focus();
        }    
    }
    
}

function startCheckingLogin() {
    var code = null;
    let count = 0;
    let timerId = setInterval(() => {
        count++;
        code = localStorage.getItem("refreshToken");
        if (code != null && code != "" && typeof code != "undefined") {
            sessionStorage.setItem("bimToken",localStorage.getItem("bimToken"));
            sessionStorage.setItem("refreshToken",localStorage.getItem("refreshToken"));
            sessionStorage.setItem("expire",localStorage.getItem("expire"));
            localStorage.removeItem("bimToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("expire");
            stopCheckingLogin(timerId, code);
        } else if (count > 60) {
            clearInterval(timerId);
        }
    }, 2000);
}

function stopCheckingLogin(timer,code) {
    clearInterval(timer);
    BIM360IssueExtension.prototype.loadIssues();
}

function onDocumentLoadFailure(viewerErrorCode) {
    console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
}

function onLoadModelSuccess(model) {
    console.log('onLoadModelSuccess()!');
    console.log('Validate model loaded: ' + (viewer.model === model));
    console.log(model);
}

function onLoadModelError(viewerErrorCode) {
    console.error('onLoadModelError() - errorCode:' + viewerErrorCode);
}

function BIM360IssueExtension(viewer, options) {
      Autodesk.Viewing.Extension.call(this, viewer, options);
      this.viewer = viewer;
      this.panel = null; 
      this.containerId = null;
      this.hubId = null;
      this.issues = null;
      this.pushPinExtensionName = 'Autodesk.BIM360.Extension.PushPin';
    }

    BIM360IssueExtension.prototype = Object.create(Autodesk.Viewing.Extension.prototype);
    BIM360IssueExtension.prototype.constructor = BIM360IssueExtension;

    BIM360IssueExtension.prototype.onSelectedChangedBind = function (event) {
        console.log(event);
        var label = event.value.label.text;
    };
    
    BIM360IssueExtension.prototype.onToolbarCreated = function () {
      this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
      this.onToolbarCreatedBinded = null;
      //this.createUI();
    };

    BIM360IssueExtension.prototype.createUI = function () {
      var _this = this;

      // SubToolbar
      this.subToolbar = (this.viewer.toolbar.getControl("MyAppToolbar") ?
        this.viewer.toolbar.getControl("MyAppToolbar") :
        new Autodesk.Viewing.UI.ControlGroup('MyAppToolbar'));
      this.viewer.toolbar.addControl(this.subToolbar);

      // create quality issue
      {
        var createQualityIssues = new Autodesk.Viewing.UI.Button('createQualityIssues');
        createQualityIssues.onClick = function (e) {
          var pushPinExtension = _this.viewer.getExtension(_this.pushPinExtensionName);
          if (pushPinExtension == null) {
            var extensionOptions = {
              hideRfisButton: true,
              hideFieldIssuesButton: true,
            };
            _this.viewer.loadExtension(_this.pushPinExtensionName, extensionOptions).then(function () { _this.createIssue(); });
          }
          else
            _this.createIssue(); // show issues
        };
        createQualityIssues.addClass('CreateIssuesExtensionIcon');
        createQualityIssues.setToolTip('Create Issues');
        this.subToolbar.addControl(createQualityIssues);
      }
      
    };


    BIM360IssueExtension.prototype.unload = function () {
      this.viewer.toolbar.removeControl(this.subToolbar);
      return true;
    };


    function BIM360IssuePanel(viewer, container, id, title, options) {
      this.viewer = viewer;
      Autodesk.Viewing.UI.PropertyPanel.call(this, container, id, title, options);
    }
    BIM360IssuePanel.prototype = Object.create(Autodesk.Viewing.UI.PropertyPanel.prototype);
    BIM360IssuePanel.prototype.constructor = BIM360IssuePanel;

    BIM360IssueExtension.prototype.loadIssues = function (containerId, urn) {

      var _this = this;
      if(typeof _this.viewer == "undefined") {
          _this.viewer = viewer;
      }
      this.pushPinExtensionName = 'Autodesk.BIM360.Extension.PushPin';
      if (_this.panel == null) {
            _this.panel = new BIM360IssuePanel(_this.viewer, _this.viewer.container, 'bim360IssuePanel', 'BIM360 Issues');
          }
        _this.getIssues();
    }

    BIM360IssueExtension.prototype.getIssues = function () {
      var _this = this;

        _this.issues = fetchAllIssuesFromBim360();
        var pushPinExtension = _this.viewer.getExtension(_this.pushPinExtensionName);
        if (_this.panel) _this.panel.removeAllProperties();
        if (_this.issues.length > 0) {
          if (pushPinExtension == null) {
            var extensionOptions = {
              hideRfisButton: false,
              hideFieldIssuesButton: false,
            };
            _this.viewer.loadExtension(_this.pushPinExtensionName, extensionOptions).then(function () { _this.showIssues(); }); // show issues (after load extension)
          }
          else
            _this.showIssues(); // show issues
        }
        else {
          if (_this.panel) _this.panel.addProperty('No issues found', 'Use create issues button');
        }
    }

    BIM360IssueExtension.prototype.showIssues = function () {
      var _this = this;
     
      //remove the list of last time
      var pushPinExtension = _this.viewer.getExtension(_this.pushPinExtensionName);
      pushPinExtension.removeAllItems();    
      pushPinExtension.showAll();

      pushPinExtension.addEventListener("pushpin.selected", this.onSelectedChangedBind);
      
        var pushpinDataArray = [];
        $("#bim360IssuePanel-scroll-container > .treeview").prepend("<button id='importIssueBtn' class='forgePanelButton importIssueBtn'>Import selected</button><button id='selectAllIssue' class='forgePanelButton selectAllIssueBtn'>Select All</button>");
      _this.issues.forEach(function (issue) {
          
            if(issue.attributes.pushpin_attributes.viewer_state != null && typeof issue.attributes.pushpin_attributes.viewer_state.seedURN != "undefined") {
                var dateCreated = issue.attributes.created_at;
                var dateUpdated = issue.attributes.updated_at;
                var dueDate = issue.attributes.due_date;
                var issueStatus = issue.attributes.status.charAt(0).toUpperCase() + issue.attributes.status.slice(1);

                var issueAttributes = issue.attributes;
                var pushpinAttributes = issue.attributes.pushpin_attributes;
                if (pushpinAttributes) {
                    issue.type = issue.type.replace('quality_', '');
                    
                    pushpinDataArray.push({
                        id: issue.id,
                        label: issue.attributes.title,
                        status: issue.type && issueAttributes.status.indexOf(issue.type) === -1 ? `${issue.type}-${issueAttributes.status}` : issueAttributes.status,
                        position: pushpinAttributes.location,
                        type: issue.type,
                        objectId: pushpinAttributes.object_id,
                        viewerState: pushpinAttributes.viewer_state
                    });
                  } 
            }
        })

      pushPinExtension.loadItemsV2(pushpinDataArray);
viewer.restoreState(pushpinDataArray.viewerState)

    }
    
    BIM360IssueExtension.prototype.createIssue = function () {
          var _this = this;
          $("#createIssuePanel").remove();
          var content = document.createElement('div');
          var mypanel = new  BIM360CreateIssuePanel(viewer.container,'createIssuePanel','Create Issue',content);
          mypanel.setVisible(true);
          getNgIssueTypes("#issueType");
          
    }


function fetchAllIssuesFromBim360() {
    var accessToken = sessionStorage.getItem("bimToken");
    var issues = JSON.parse(sessionStorage.getItem("issues"));
    var returnArray=[];
    var it = "e79b1aa1-aeb6-40c7-9508-c35e4c7ec6c2";
            var url = "https://developer.api.autodesk.com/issues/v1/containers/"+it+"/quality-issues?page[limit]=100";
             $.ajax({
                  type: "GET",
                  beforeSend: function(request) {
                    request.setRequestHeader("Authorization", "Bearer "+accessToken);
                    request.setRequestHeader("Content-Type", "application/vnd.api+json");
                  },
                  url: url,
                  async: false,
                  error: function(httpObj, textStatus) {    
                      
                        if(httpObj.status==401) {
                            var token = refreshBimDocToken();
                            if(token!=null) {
                            } else {
                                app.trigger("statusMessage:new", {
                                    message : messageUtils.getMessageString("bim.doc.token.expire"),
                                    messageLevel : "ERROR",
                                    showModal : true
                                 });
                            }
                        } else {
                             app.trigger("statusMessage:new", {
                                message : messageUtils.getMessageString("bim.doc.token.error"),
                                messageLevel : "ERROR",
                                showModal : true
                             });
                        }
                  },
                  success: function(msg) {
                      
                      if(!$.isEmptyObject(msg.data)) {
                          for(var i=0;i<msg.data.length;i++) {
                              returnArray.push(msg.data[i]);
                          }
                      }
                  }
             });

    return returnArray;
}

$(document).on("click","#addWIR",function() {
    var issueData = "";
     var pushPinExtension = viewer.getExtension("Autodesk.BIM360.Extension.PushPin");
     pushPinExtension.removeAllItems(); 
      pushPinExtension.pushPinManager.addEventListener('pushpin.created', function (e) {
             pushPinExtension.pushPinManager.removeEventListener('pushpin.created', arguments.callee);
            pushPinExtension.endCreateItem();
             var target_urn = sessionStorage.getItem("containerUrn");
             var starting_version = 1;
               var issue = pushPinExtension.getItemById(pushPinExtension.pushPinManager.pushPinList[0].itemData.id ); 
         
             if (issue === null) return; 
             var data = {
               type: 'quality_issues',
               attributes: {
                 title: "", 
                 description: "",
                 status: "",
                 due_date: "",
                 target_urn: "",
                 starting_version: "", 
                 ng_issue_type_id: "",
                 ng_issue_subtype_id: "",

                 sheet_metadata: { 
                   is3D: true,
                   sheetGuid: this.viewer.model.getDocumentNode().data.guid,
                   sheetName: this.viewer.model.getDocumentNode().data.name
                 },
                 pushpin_attributes: { 
                   attributes_version : 2,
                   type: 'TwoDVectorPushpin', 
                   object_id: issue.objectId, 
                   location: issue.position, 
                   viewer_state: issue.viewerState 
                 },
               }
            };
             var ids = sessionStorage.getItem("containerId");
             $("#myModal").toggle("modal");
         });     
     pushPinExtension.startCreateItem({ label: "New", status: 'open', type: 'issues' });
          
});

BIM360CreateIssuePanel = function(parentContainer, id, title, content, x, y)
        {
          this.content = content;
          this.closer = this.getDocument().createElement("div");
          this.closer.className = "docking-panel-close";
         
        Autodesk.Viewing.UI.DockingPanel.call(this, parentContainer, id, title,{shadow:false});

        // Auto-fit to the content and don't allow resize.  Position at the coordinates given.
        //
        this.container.style.height = "575px";
        this.container.style.width = "350px";
        this.container.style.right =  "50px";
        this.container.style.top = "100px"; 
        this.container.style.resize = "auto";

        };

        BIM360CreateIssuePanel.prototype = Object.create(Autodesk.Viewing.UI.DockingPanel.prototype);
        BIM360CreateIssuePanel.prototype.constructor = BIM360CreateIssuePanel;
        
        BIM360CreateIssuePanel.prototype.initialize = function()
        { 
                this.title = this.createTitleBar(this.titleLabel || this.container.id);
        this.container.appendChild(this.title);

        this.container.appendChild(this.content);
        this.container.appendChild(this.closer);


        var op = {left:false,heightAdjustment:45,marginTop:0};
        this.scrollcontainer = this.createScrollContainer(op);
        
         var issueType = '<select id="issueType" class="form-control createIssueInputs"></select>';
         var issueSubType = '<select id="issueSubType" class="form-control createIssueInputs"></select>';
        
        var myvar = '<div style="padding: 5px 40px 5px 15px;"><div class="form-group"><label for="issueTitle">Title</label>'+
            '<input type="text" class="form-control createIssueInputs" id="issueTitle" aria-describedby="emailHelp" placeholder="Enter title">'+
            '<small id="titleError" style="color:red; display:none;" class="form-text text-muted">Please enter valid title.</small></div>'+
            '<div class="form-group"><label for="issueStatus">Select Status</label>'+
            '<select class="form-control createIssueInputs" id="issueStatus" ><option value="open">Open</option><option value="draft">Draft</option></select>'+
            '<small id="statusError" style="color:red; display:none;" class="form-text text-muted">Select valid status.</small></div>'+
            '<div class="form-group"><label for="issueType">Issue type</label>'+issueType+'<small id="typeError" style="color:red; display:none;" class="form-text text-muted">Select valid type.</small></div>'+
            '<div class="form-group"><label for="issueType">Issue sub type</label>'+issueSubType+'<small id="subTypeError" style="color:red; display:none;" class="form-text text-muted">Select valid sub type.</small></div>'+
            '<div class="form-group"><label for="issueDate">Due date</label>'+
            '<input type="date" class="form-control createIssueInputs createEditIssueDate" id="issueDate" aria-describedby="emailHelp"><small id="dateError" style="color:red; display:none;" class="form-text text-muted">Please enter valid due date.</small></div>'+
            '<div class="form-group"><label for="issueDesc">Description</label>'+
            '<input type="email" class="form-control createIssueInputs" id="issueDesc" aria-describedby="emailHelp" placeholder="Enter description"></div>'+
            '<center><button onClick="return createNewIssue(this);" style="width: 170px; margin-bottom: 20px;" class="forgePanelButton">Done</button></center>'
            '</div>';
            
        
        var html = [myvar].join('\n');


        $(this.scrollContainer).append(html);

        this.initializeCloseHandler(this.closer);
        this.initializeMoveHandlers(this.title);
               
        };

Autodesk.Viewing.theExtensionManager.registerExtension('BIM360IssueExtension', BIM360IssueExtension);


//https://shrouded-ridge-44534.herokuapp.com/api/forge/oauth/callback
//http://localhost:80/Lagos/Home/autodeskRedirect

/* 
git add .
git commit -am "make it better"
git push heroku master
git push ordigin master

*/