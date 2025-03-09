const app = require('./server/index.js');
const port = 3001;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 