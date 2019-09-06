const express = require('express');
const app = express();
const appserver = process.env.APPSERVER || 'localhost';
const port = process.env.PORT || 3000;
const rootDir = process.cwd();

app.use(express.static('client'));
app.get('/', (req, res) => {
  if (appserver === 'eyevocalize.com' && req.protocol === 'http') {
    res.redirect('https://' + req.headers.host);
  } else {
    res.sendFile(rootDir+'/client/app.html');
  }
});

app.listen(port, () => console.log(`App listening on port ${port}!`));
