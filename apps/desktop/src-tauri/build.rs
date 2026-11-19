fn main() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::fs::create_dir_all("bin");
        let _ = std::process::Command::new("clang")
            .args([
                "-O2",
                "-framework", "LocalAuthentication",
                "-framework", "Foundation",
                "-o", "bin/localvault-touchid",
                "touchid.m",
            ])
            .status();
    }
    tauri_build::build()
}
