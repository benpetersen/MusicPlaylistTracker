function saveDecisionsToExcelSheet(playlistData){
  const artistData = [];
  for(var u=0;u<playlistData.notMatchedAddManually.length;u++){
    let row = [];

    let track = playlistData.addToPlaylist[x].song
    let artistName = playlistData.addToPlaylist[x].artist
    row.push("", track.replace("'",""), artistName.replace("'",""),"add manually")
    //console.log(row)
    artistData.push(row)
  }

  for(var x=0;x<playlistData.addToPlaylist.length;x++){
    let row = [];

    let track = playlistData.addToPlaylist[x].song
    let artistName = playlistData.addToPlaylist[x].artist
    row.push("", track.replace("'",""), artistName.replace("'",""),"add")
    //console.log(row)
    artistData.push(row)
  }
  for(var y=0;y<playlistData.keepInPlaylist.length;y++){
    let row = [];

    let track = playlistData.keepInPlaylist[y].song
    let artistName = playlistData.keepInPlaylist[y].artist
    row.push("", track.replace("'",""), artistName.replace("'",""),"keep")
    //console.log(row)
    artistData.push(row)
  }
  for(var z=0;z<playlistData.removeFromPlaylist.length;z++){
    let row = [];

    let track = playlistData.removeFromPlaylist[z].song;
    let artistName = playlistData.removeFromPlaylist[z].artist
    row.push("", track.replace("'",""), artistName.replace("'",""),"remove")
    //console.log(row)
    artistData.push(row)
  }

  createTabInSpreadsheet(artistData);
}
  
  /*const data = ImportJSON(githubJsonUrl,"","")

  const artistData = [];
  for(var i=1;i<data.length;i++){
    let row = [];
    for(var k=columnDataStarts;k<columnDataEnds;k++){
      let item = data[i][k];
      item = item.replace("'","")
      row.push(item)

    }
      console.log(row);
      artistData.push(row)
  }*/
function createTabInSpreadsheet(data) {
    var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var yourNewSheet = activeSpreadsheet.getSheetByName(spreadsheetName);

    if (yourNewSheet != null) {
      console.log("Sheet is blank", spreadsheetName)
        //activeSpreadsheet.deleteSheet(yourNewSheet);
    }

    yourNewSheet = activeSpreadsheet.insertSheet();
    const datetime = new Date().toLocaleString('en-US',{hour12: true, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})
    yourNewSheet.setName(datetime);
    //set the data in the sheet
    yourNewSheet.getRange(
      yourNewSheet.getLastRow() + 1,
      1,
      data.length,
      data[0].length
  )
  .setValues(data);
}
/**
 * Retrieves all the rows in the active spreadsheet that contain data and logs the
 * values for each row.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function readRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var rows = sheet.getDataRange();
  var numRows = rows.getNumRows();
  var values = rows.getValues();

  for (var i = 0; i <= numRows - 1; i++) {
    var row = values[i];
    Logger.log(row);
  }
};

/**
 * Adds a custom menu to the active spreadsheet, containing a single menu item
 * for invoking the readRows() function specified above.
 * The onOpen() function, when defined, is automatically invoked whenever the
 * spreadsheet is opened.
 * For more information on using the Spreadsheet API, see
 * https://developers.google.com/apps-script/service_spreadsheet
 */
function onOpen() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var entries = [{
    name : "Read Data",
    functionName : "readRows"
  }];
  sheet.addMenu("Script Center Menu", entries);
};
