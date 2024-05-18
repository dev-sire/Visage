
### Visage: A Social Media App for Sharing Your Vision

Visage is a social media app built from the ground up to empower you to capture and share your world with stunning visuals. Unleash your creativity with stories, posts, and more, and connect with a community of passionate creators.

### Key Features: 

- **Effortless Photo Sharing:** Capture, edit, and share photos in high resolution, showcasing the beauty you encounter.
- **Inspiring Content Exploration:** Discover captivating content from other creators and find your tribe.
- **Seamless Connections:** Build friendships and engage with fellow creators who share your interests.
- **Save for Later:** Bookmark photos that inspire you for future reference or creative inspiration.
- **Infinite Scrolling:** Keep exploring! Effortlessly discover more photos as you scroll through endless visual inspiration.

### Tech Stack:
- **Backend:** Appwrite
- **Frontend:** React (with TypeScript for enhanced type safety) - Enforces data types for cleaner and more maintainable code
- **React Router:** Efficient navigation within the app
- **Tailwind CSS:** Rapid UI development with utility classes
- **Shad CN:** Smooth animations for enhancing user experience (Optional)
- **Tanstack Query:** Effective data fetching and caching management

### Getting Started:
This repository provides the source code for the Visage social media app. To set up and run the app locally, follow these steps:

**1. Prerequisites:**    

- Node.js and npm (or yarn) installed on your system.
- An Appwrite account (or Firebase account if using Firebase).

**2. Clone The Repository:**  
```Bash
git clone https://github.com/dev-sire/visage.git
```

**3. Install Dependencies:**  
```Bash
cd visage
npm install 
```
**4. Configure Appwrite:**
- Follow the documentation for your chosen backend provider to set up your project and obtain the necessary configuration details (API keys, database URLs, etc.).
- Create a `.env.local` file in the project root directory and store your configuration details there using environment variables. Here's an example structure:
```Bash
REACT_APP_APPWRITE_ENDPOINT=https://your-appwrite-endpoint.com/v1
REACT_APP_APPWRITE_PROJECT=your-appwrite-project-id
REACT_APP_APPWRITE_FUNCTION=your-appwrite-function-id  # Optional, if using Appwrite functions
```
**5. Start the Development Server:**
```Bash
npm run dev
```

### Contributing
We welcome contributions from the community! If you have bug fixes, feature suggestions, or improvements, feel free to create a pull request. Before submitting a pull request, please:
- Fork the repository.
- Create a new branch for your changes.
- Implement your changes and write tests for them.
- Adhere to the existing code style and formatting.
- Submit a pull request with a clear description of your changes.

### License:
This project is licensed under the MIT License (see the `LICENSE` file for details).

### Bug Reporting

As a solo developer, I appreciate your help in identifying and fixing bugs. Please report any issues you encounter through GitHub Issues or create a pull request with a fix.

### Disclaimer
This project is still under development, and there might be ongoing improvements and bug fixes. Your valuable feedback is crucial in shaping Visage into a fantastic social media app. Let's create a platform that empowers visual storytelling and fosters a vibrant community!