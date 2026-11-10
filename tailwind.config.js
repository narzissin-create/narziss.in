export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "#F5E6CC",
        primary: "#2D4F1E",
        text: "#313131",
        accent: "#C08552",
        "on-primary": "#F5E6CC",
      },
      fontFamily: {
        sans: ["Google Sans", "Arial", "sans-serif"],
        display: ["Poppins", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
