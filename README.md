# Legal Lens

Legal Lens is a chrome extension that leverages Chrome's built-in AI to help users understand and analyze legal documents more effectively. It provides features such as summarization, key point extraction, and question answering based on the content of the documents.

## Prerequisites

Before setting up the project, ensure you have the following installed:

- [Bun](https://bun.sh/)
- Node.js
- Git

## Getting Started

Follow these steps to set up and run the project locally:

### 1. Clone the Repository

```bash
git clone https://github.com/keanesc/legal-lens.git
cd legal-lens
```

### 2. Install Dependencies

Use Bun to install the project dependencies:

```bash
bun install
```

### 3. Build the Extension

```bash
bun run build
```

The build output will be located in the `dist` directory.

### 4. Load the Extension in Your Browser

To load the extension in your browser, follow these steps:

1. Open your browser and navigate to the extensions page (e.g., `chrome://extensions/` for Chrome).
2. Enable "Developer mode" (usually found in the top right corner).
3. Click on "Load unpacked" and select the `dist` directory from the project
   root.

## Project Structure

- `src/`: Contains the source code of the application.
- `public/`: Static assets such as icons and the manifest file.
- `dist/`: Generated production build files.
- `package.json`: Project metadata and scripts.
- `vite.config.ts`: Vite configuration file.
- `tsconfig.json`: TypeScript configuration file.

## Scripts

- `bun run lint`: Run ESLint to check for code quality issues.

## Dependencies

This project uses the following key dependencies:

- **React**: A JavaScript library for building user interfaces.
- **TypeScript**: A strongly typed programming language that builds on JavaScript.
- **Tailwind CSS**: A utility-first CSS framework for styling.
- **Lucide React**: A library of customizable icons for React.

## License

This project is licensed under the GNU GPLv3 License. See the `LICENSE` file for details.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve the project.
