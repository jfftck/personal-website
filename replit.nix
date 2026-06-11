{ pkgs }: {
    deps = [
      pkgs.tree-sitter-grammars.tree-sitter-jsdoc
      pkgs.micro
      pkgs.nano
      pkgs.nodePackages.vscode-langservers-extracted
      pkgs.nodePackages.typescript-language-server
    ];
  }