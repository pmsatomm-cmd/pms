/**
 * Google Apps Script Webhook for Training Management System
 * Deploys as a Web App to receive updates and record them to a Google Sheet.
 */

function doPost(e) {
  try {
    var json = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Check if sheet has headers, if not, write them
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Start Date", 
        "College Name", 
        "Course", 
        "Semester/Batch", 
        "Training Domain", 
        "Training Dates", 
        "Total Hours", 
        "Archived Status", 
        "Completed Count",
        "Pending Count",
        "Total Count",
        "Completion %", 
        "Sai Kumar (Team L&D) Signature", 
        "Siljy John (Team HR) Signature", 
        "Client/Coordinator Signature",
        "Last Edited By",
        "Last Edited Timestamp",
        "Pending Fields"
      ];
      sheet.appendRow(headers);
      // Format headers
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#e2efda"); // Light green header
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
    
    var timestamp = new Date();
    
    // Search if this program already exists in the sheet to update it, or append new
    var collegeName = json.collegeName || "";
    var programName = json.programName || "";
    
    var lastRow = sheet.getLastRow();
    var rowIndex = -1;
    
    // We will search column B (College Name) and C (Program Name) for existing entry to avoid duplication
    if (lastRow > 1) {
      var data = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][0] === collegeName && data[i][1] === programName) {
          rowIndex = i + 2; // Rows are 1-indexed, loop starts at row 2
          break;
        }
      }
    }
    
    var rowData = [
      timestamp,
      collegeName,
      programName,
      json.semesterBatch || "",
      json.trainingDomain || "",
      json.trainingDates || "",
      json.totalHours || "",
      json.isArchived ? "Archived" : "Active",
      json.completedCount || 0,
      json.pendingCount || 0,
      json.totalCount || 0,
      json.completionPercent || "0%",
      json.sigSai || "",
      json.sigLilly || "",
      json.sigAbishith || "",
      json.lastEditedBy || "N/A",
      json.lastEditedAt || "N/A",
      json.unfilledFields || "None"
    ];
    
    if (rowIndex !== -1) {
      // Update existing row
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      // Append new row
      sheet.appendRow(rowData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Data synced successfully",
      updatedRow: rowIndex !== -1 ? rowIndex : sheet.getLastRow()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
