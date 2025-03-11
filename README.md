## Description 
 Vaultly is a finance manager program, designed for students to be able to manage their money and build strong fiscal sense. 


## Key Files and Directories

- **index.html**: The main HTML file for the frontend.
- **package.json**: Contains project dependencies and scripts.
- **server/**: Contains backend server code.
  - **db.js**: Database connection and configuration.
  - **index.js**: Main server file.
  - **routes/**: Contains route handlers.
    - **goals.js**: Route handlers for goals.
- **src/**: Contains frontend source code.
  - **database/**: Database-related scripts.
    - **fix-transactions.js**: Script to fix transaction data.
    - **init-db.js**: Script to initialize the database.
    - **migrations/**: Database migration files.
    - **schema.sql**: SQL schema for the database.
  - **html/**: HTML files for different pages.
    - **dashboard.html**: Dashboard page.
  - **images/**: Image assets.
  - **js/**: JavaScript files for frontend logic.
    - **api.js**: API interaction logic.
    - **auth.js**: Authentication logic.
    - **categories.js**: Category management logic.
    - **common.js**: Common utility functions.
    - **dashboard.js**: Dashboard logic.
    - **goals.js**: Goals management logic.
    - **index.js**: Main entry point for frontend.
    - **login.js**: Login page logic.
    - **main.js**: Main application logic.
    - **newtransaction.js**: New transaction logic.
    - **Rpurchases.js**: Recurring purchases logic.
    - **server.js**: Server interaction logic.
  - **style/**: CSS stylesheets.

## Dependencies & Libraries
- Abanoub Magdy--uiverse.io
    - signup and login animations 

- Node.js

- Apexcharts.js

- Express.js

- bcrypt

- jsonwebtoken

## Getting Started

1. Clone the repository.
2. Install dependencies using `npm install`.
3. Set up the database using the scripts in `src/database/`.
4. Run the server using `node server.js`.
5. Open `index.html` in your browser to access the frontend.

## License

This project is licensed under the MIT License.
