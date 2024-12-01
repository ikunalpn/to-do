var myDB = require('mysql2');
var data = {};
var md5 = require('md5');
const { head } = require('../routes/auth');
const cookieParser = require('cookie-parser');
var conPool = myDB.createPool(
    {
        connectionLimit: 100, 
        host : "localhost",
        user: 'root',
        password: 'root',
        database: "to-do-app",
        debug: false,
        waitForConnections: true,
        queueLimit: 0
    }
);


function grabHeaders(headerData){
    return headerData.map(h => h.name);
}


function sendResponse(res,message="ok", data={}, error = false,status=200){
    try{
        res.status(status).json(
           {

            message:message,
            data:data
           }
);
    } catch(error){
        res.json({message:error})
    }
}



function getUserTypes(req, res) {
    conPool.query("SELECT id, type, description FROM user_types", (err, data, headerData) => {
        if (err) {
            console.error(err);
            sendResponse(res, "SQL Error", { message: err.message }, true, 500);
            return;
        }
        sendResponse(res, "ok", {
            heads: grabHeaders(headerData),
            data: data
        });
    });
}

function createUser(req, res) {
    console.log('Incoming request body:', req.body); 
    const username = req.body.username;
    const fname = req.body.fname;
    const lname = req.body.lname;
    const email = req.body.email;
    const password = req.body.password;
    


    if (!username || !fname || !lname || !email || !password) {
        console.log('Missing fields:', { username, fname, lname, email, password }); 
        return sendResponse(res, "All fields are required", {}, true, 400);
    }

    const hashedPassword = md5(password);
    const query = 'INSERT INTO users (username, fname, lname, email, passkey, active) VALUES (?, ?, ?, ?, ?, ?)';
    const values = [username, fname, lname, email, hashedPassword, 1];

    conPool.query(query, values, (err, result) => {
        if (err) {
            console.error(err);
            return sendResponse(res, "Error creating user", { message: err.message }, true, 500);
        }
        sendResponse(res, "User created successfully", { userId: result.insertId }, false, 201);
    });
}


function updateUser(req, res) {
    console.log('Incoming request body for update:', req.body);

    const userId = req.params.id; 

    const fname = req.body.fname;
    const lname = req.body.lname;

    if (!fname && !lname) {
        console.log('No fields to update provided:', { fname, lname });
        return sendResponse(res, "At least one field (fname or lname) is required to update", {}, true, 400);
    }

    const updates = [];
    const values = [];

    if (fname) {
        updates.push('fname = ?');
        values.push(fname);
    }
    if (lname) {
        updates.push('lname = ?');
        values.push(lname);
    }

    values.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    conPool.query(query, values, (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return sendResponse(res, "Error updating user", { message: err.message }, true, 500);
        }

        if (result.affectedRows === 0) {
            return sendResponse(res, "User not found", {}, true, 404);
        }

        sendResponse(res, "User updated successfully", { userId }, false, 200);
    });
}


function doLogin(req, res) {
    const { username, password } = req.body;
    const hashedPassword = md5(password); 

    const query = 'SELECT id, fname, lname FROM users WHERE username = ? AND passkey = ?';
    
    conPool.query(query, [username, hashedPassword], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return sendResponse(res, "Database query error", { message: err.message }, true, 500);
        }

        if (results.length > 0) {
            const user = results[0]; 
            req.session.loggedIn = true;     
            req.session.uid = user.id;        
            req.session.fname = user.fname;   
            console.log(req.session.uid)
            return sendResponse(res, "Login Success!", { user: user }, false, 200);
        } else {
            return sendResponse(res, "Invalid username or password", {}, true, 401);
        }
    });
}

function dbRead(res, table, condition = null, values = [], limit = null, order = 'ASC', orderBy = 'id') {
    let query = `SELECT * FROM ${table} ${condition || ''} ORDER BY ${orderBy} ${order}`;

    if (limit) {
        query += ` LIMIT ?`;
        values.push(limit);
    }

    conPool.query(query, values, (err, data) => {
        if (err) {
            console.error('SQL Error:', err);
            return res.status(500).json({ message: "Internal Server Error", error: err.message });
        }
        res.status(200).json({ message: "Todos retrieved successfully", data: data });
    });
}

function dbCud(res, cudOp, table, colValMap, condition = null, successMessage, errorMessage, conditionValues =[]) {
    let query;
    let values = [];  

    switch (cudOp.toLowerCase()) {
        case 'select':
            const selectedColumns = '*';  
            query = `SELECT ${selectedColumns} FROM ${table} WHERE ${condition}`;
            values = Array.from(colValMap.values()); 
            break;
        case 'insert':
            const columns = Array.from(colValMap.keys()).join(', ');
            const placeholders = Array.from(colValMap.keys()).map(() => '?').join(', ');

            query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

            values = Array.from(colValMap.values());

            break;

        case 'update':
            const updateOperations = [];
            const updateValues = []; // This holds the values to update

            // Collect update operations and values
            colValMap.forEach((value, key) => {
                updateOperations.push(`${key} = ?`); // Prepare "SET" clause
                updateValues.push(value); // Collect values for the update
            });

            // Construct the update query
            if (condition) {
                query = `UPDATE ${table} SET ${updateOperations.join(', ')} WHERE ${condition}`;
            }

            // Log the generated query for debugging
            console.log('Generated Update Query:', query);
            console.log('Update Values:', updateValues);
            console.log('Condition Values:', conditionValues);

            // Combine values for placeholders, ensuring condition values are included
            values = [...updateValues, ...conditionValues]; 

            // Execute the query using combined values
            conPool.query(query, values, (err, result) => {
                if (err) {
                    console.error('Error updating data:', err);
                    return res.status(500).json({ message: errorMessage, error: err.message });
                }

                // Check if any rows were affected
                if (result.affectedRows === 0) {
                    return res.status(404).json({ message: 'Task not found to update' });
                }

                res.status(200).json({ message: successMessage });
            });
            return; // Exit the function to avoid further processing

            break;

        case 'delete':
            query = `DELETE FROM ${table} ${condition ? condition : ''}`; 
            values.push(colValMap.title); 
            values.push(colValMap.uid); 
                
            break;
        default:
            console.error('Invalid operation specified:', cudOp);
            return res.status(400).json({ message: 'Invalid operation' });
    }

    console.log('Generated Query:', query);
    console.log('Values:', values);

    conPool.query(query, values, (err, result) => {
        if (err) {
            console.error('Database operation failed:', err);
            return res.status(500).json({ message: errorMessage, error: err.message });
        }
        res.status(200).json({ message: successMessage, result });
    });
}

function activateTask(req, res) {
    const taskId = req.params.id; 

    const colValMap = new Map();
    colValMap.set('active', 1); 

    doCub(res, 'update', 'tasks', colValMap, `id = ?`, 'Task activated successfully', 'Error activating task');
}

function deactivateTask(req, res) {
    const taskId = req.params.id; 

    const colValMap = new Map();
    colValMap.set('active', 0); 

    doCub(res, 'update', 'tasks', colValMap, `id = ?`, 'Task deactivated successfully', 'Error deactivating task');
}


function updateTaskCom(req, res) {
    {
        const { taskId, completed } = req.body; // completed is expected to be 0 or 1
        const table = 'tasks'; // Specify your table name
        const errorMessage = 'Failed to update task completion status';
        const successMessage = 'Task completion status successfully updated';
    
        // Define the condition and values
        const condition = 'id = ?'; // Where clause condition
        const conditionValues = [taskId]; // Placeholder values for the condition
    
        try {
            const updateOperations = [];
            const updateValues = [];
    
            // Prepare the SET clause based on the completed status
            updateOperations.push('completed = ?'); // Specify the field to update
            updateValues.push(completed === 1 ? 1 : 0); // Set the correct value for completion
    
            // Construct the update query
            const query = `UPDATE ${table} SET ${updateOperations.join(', ')} WHERE ${condition}`;
    
            console.log('Generated Update Query:', query);
            console.log('Update Values:', updateValues);
            console.log('Condition Values:', conditionValues);
    
            // Combine values for placeholders
            const values = [...updateValues, ...conditionValues];
    
            // Execute the query using combined values
            conPool.query(query, values, (err, result) => {
                if (err) {
                    console.error('Error updating data:', err);
                    return res.status(500).json({ message: errorMessage, error: err.message });
                }
    
                // Check if any rows were affected
                if (result.affectedRows === 0) {
                    return res.status(404).json({ message: 'Task not found to update' });
                }
    
                res.status(200).json({ message: successMessage });
            });
        } catch (error) {
            console.error('Error processing request:', error);
            res.status(500).json({ message: errorMessage, error: error.message });
        }
    }
}
module.exports = {
    getUserTypes,
    createUser,
    doLogin,
    dbCud,
    dbRead,
    activateTask,
    deactivateTask,
    conPool, updateUser,
    updateTaskCom
};
