const express = require('express');
var todoRouter = express.Router();
const db = require('../db-ops/dbHandler');
const authM = require('../middleware/auth-middle-ware');
const { route } = require('./auth');



// todoRouter.post('/activate/:id', authM.chkLogin, (req, res) => {
//     db.activateTask(req, res); // 
// });


// todoRouter.post('/deactivate/:id', authM.chkLogin, (req, res) => {
//     db.deactivateTask(req, res); 
// });

todoRouter.post('/activate', (req, res) => {
    db.dbCud(res, 'update', 'users', new Map([['active', '1']]), `where id=${req.body.userId}, User ${req.body.userId} activated!`, 'Activating User failed!'); // Activating the specified user
});


todoRouter.post('/deactivate', (req, res) => {
    db.dbCud(res, 'update', 'users', new Map([['active', '0']]),    `where id=${req.body.userId}, User ${req.body.userId} deactivated! `, 'Deactivating User failed!'); // Deactivating the specified user
});

// Update Task Completion Status
todoRouter.post('/update-completion', async (req, res) => {
    db.updateTaskCom(req,res);
} );


function getFormattedTodayDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${year}-${month}-${day}`; 
}


function getCurrentTime() {
    return new Date().toLocaleTimeString('en-GB', { hour12: true}); 
}
todoRouter.post('/addtodo', authM.chkLogin, (req, res) => {
    const { title, details } = req.body; 
    const uid = req.session.uid; 

    console.log("Request Body:", req.body); 
    console.log("UID:", uid); 

    
    if (!title || !details || !uid) {
        return res.status(400).json({
            message: "Adding Task failed!",
            error: "Title, details, and user ID must be provided."
        });
    }

    
    const createdDate = getFormattedTodayDate(); 
    const updatedTime = getCurrentTime(); 

    
    let todo = new Map([
        ['title', title],
        ['details', details],
        ['uid', uid],
        ['created_date', createdDate], 
        ['updated_time', updatedTime]  
    ]);

    
    db.dbCud(res, 'insert', 'tasks', todo, null, `Task ${title} added!`, `Adding Task failed!`);
});

todoRouter.post('/edittodo', authM.chkLogin, (req, res) => {
    const { titleId, newTitle, newDetails } = req.body; // Get inputs from request body
    const uid = req.session.uid; // Get User ID from session

    // Validate input parameters
    if (!titleId || (!newTitle && !newDetails) || !uid) {
        return res.status(400).json({ message: 'Invalid input data.' });
    }

    const colValMap = new Map(); // This will hold the columns and their updated values
    if (newTitle) colValMap.set('title', newTitle); // Add new title to map
    if (newDetails) colValMap.set('details', newDetails); // Add new details to map

    const condition = `id = ? AND uid = ?`; // Condition for the record to update
    const conditionValues = [titleId, uid]; // Ensure you collect these as integers

    // Call dbCud to execute the update
    db.dbCud(res, 'update', 'tasks', colValMap, condition, 'Task updated successfully', 'Failed to update task', conditionValues);
});




todoRouter.post('/gettodo', authM.chkLogin, (req, res) => {
    const uid = req.session.uid; 
    console.log("UID:", uid); 

    const columns = ['title', 'details', 'created_date', 'updates_time', 'completed'];


    db.dbRead(res, 'tasks', `WHERE uid = ?`, [uid]); 
});


todoRouter.post('/deltodo', authM.chkLogin, (req, res) => {
    const { title } = req.body; 
    const uid = req.session.uid; 

    console.log("Request to delete task with title:", title); 
    console.log("User ID:", uid); 

    
    if (!title || !uid) {
        return res.status(400).json({
            message: "Deleting Task failed!",
            error: "Task title and user ID must be provided."
        });
    }

    
    db.dbCud(res, 'delete', 'tasks', { title: title, uid: uid }, `WHERE title = ? AND uid = ?`, 
             `Task "${title}" deleted!`, 
             `Deleting Task failed!`);
});
module.exports = todoRouter;