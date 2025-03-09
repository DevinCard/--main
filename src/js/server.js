const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/style', express.static(path.join(__dirname, '../style')));
app.use('/resource', express.static(path.join(__dirname, '../resource')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/images', express.static(path.join(__dirname, '../images')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "../../index.html"));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, "../resource/signup.html"));
});

app.post('/signup', (req, res) => {
  const { firstName, lastName, email, password, confirmPassword } = req.body;

  let errors = {};

  if (!firstName || firstName.trim().length < 2) {
    errors.firstName = "First name must be at least 2 characters.";
  }

  if (!lastName || lastName.trim().length < 2) {
    errors.lastName = "Last name must be at least 2 characters.";
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
  if (!password || !passwordRegex.test(password)) {
    errors.password = "Password must include at least 8 characters, 1 number, and 1 special character.";
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords must match.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  res.status(200).json({ message: "Signup successful!" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
