const ShowPasswordToggle = () => {
    const passwordInputs = document.querySelectorAll("[type='password']");
    const togglePasswordButtons = document.querySelectorAll(".toggle-password");

    passwordInputs.forEach((passwordInput, index) => {
        passwordInput.classList.add("input-password");
        const togglePasswordButton = togglePasswordButtons[index];
        if (togglePasswordButton) {
            togglePasswordButton.classList.remove("d-none");
            togglePasswordButton.addEventListener("click", () => togglePassword(passwordInput, togglePasswordButton));
        }
    });

    function togglePassword(passwordInput, togglePasswordButton) {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            togglePasswordButton.setAttribute("aria-label", "Hide password.");
        } else {
            passwordInput.type = "password";
            togglePasswordButton.setAttribute("aria-label", "Show password as plain text. Warning: this will display your password on the screen.");
        }
    }
};

ShowPasswordToggle();
