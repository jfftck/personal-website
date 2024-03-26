{ pkgs }: {
    deps = [
      pkgs.micro
      pkgs.nano
      pkgs.nodePackages.vscode-langservers-extracted
      pkgs.nodePackages.typescript-language-server
    ];
  }