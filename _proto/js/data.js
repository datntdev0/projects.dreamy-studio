/*
 * Dreamy Studio prototype — static data.
 * Navigation model mirrors _docs/1.Product-Capabilities.md (capabilities + high-level requirements).
 * Every functional screen is "coming soon" for now; each one lists the requirements it will cover.
 * Workspaces below are fake and only exist so the workspace switch dialog has something to show.
 */
window.DS = (function () {
  const CAP = {
    "01": "CAP-01 · Workspace Management",
    "02": "CAP-02 · Novel Management",
    "03": "CAP-03 · Novel Translation",
    "04": "CAP-04 · Novel Knowledgebase",
    "05": "Library Management",
    "06": "CAP-06 · Project Management",
    "07": "CAP-07 · Pre-Production",
    "08": "CAP-08 · Production Modules",
    "09": "CAP-09 · Post-Production",
    "10": "CAP-10 · Distribution",
    "11": "CAP-11 · Smart Assistant",
    "12": "CAP-12 · Configuration",
  };

  /** Rail → explorer sections → items. Item = a tab that can be opened in the editor area. */
  const NAV = {
    projects: {
      label: "Projects",
      icon: "folder",
      sections: [
        {
          id: "projects", title: "Projects", headless: true,
          items: [{
            id: "projects", title: "Project catalog", icon: "folder", cap: CAP["06"],
            blurb: "Create projects from templates, manage the project catalog in the workspace and open each project’s workspace.",
            reqs: [
              ["REQ-06-001", "Create a new project from a template and manage the project catalog in the workspace"],
              ["REQ-06-002", "The project workspace with the modules and tools it needs"],
            ],
          }],
        },
        { id: "pfilters", title: "Filters", items: [] },
        {
          id: "pre", title: "Pre-Production", hidden: true,
          items: [
            {
              id: "scripting", title: "Scripting", icon: "pen", cap: CAP["07"],
              blurb: "Script audiobook and filmseries projects.",
              reqs: [
                ["REQ-07-001", "SCRIPTING: script the audiobook project"],
                ["REQ-07-002", "SCRIPTING: script the filmseries project"],
              ],
            },
            {
              id: "character", title: "Character", icon: "user", cap: CAP["07"],
              blurb: "Create image references for characters to use consistently across scenes.",
              reqs: [["REQ-07-003", "CHARACTER: create image references for characters"]],
            },
            {
              id: "world", title: "World", icon: "cube", cap: CAP["07"],
              blurb: "Build a three-dimensional world with clays models.",
              reqs: [["REQ-07-004", "WORLD: build a three-dimensional world with clays models"]],
            },
            {
              id: "storyboard", title: "Storyboard", icon: "frames", cap: CAP["07"],
              blurb: "Split scenes from the content and draw a storyboard with frames.",
              reqs: [["REQ-07-005", "STORYBOARD: split scenes from the content and draw a storyboard with frames"]],
            },
          ],
        },
        {
          id: "prod", title: "Production", hidden: true,
          items: [
            {
              id: "audiobook", title: "Audiobook", icon: "mic", cap: CAP["08"],
              blurb: "Generate audio from the locked script and check the results.",
              reqs: [["REQ-08-001", "AUDIOBOOK: generate audio from the locked script and check the results"]],
            },
            {
              id: "canvas", title: "Canvas", icon: "nodes", cap: CAP["08"],
              blurb: "Design free-form workflows with a canvas mechanism to produce high-quality resources.",
              reqs: [
                ["REQ-08-002", "CANVAS: Build the canvas workflow from the resources prepared earlier"],
                ["REQ-08-003", "CANVAS: Run the canvas workflow to produce high-quality resources"],
              ],
            },
          ],
        },
        {
          id: "post", title: "Post-Production", hidden: true,
          items: [{
            id: "video", title: "Video editor", icon: "film", cap: CAP["09"],
            blurb: "Assemble post-production video from the project’s resources, apply effects and render the final product.",
            reqs: [
              ["REQ-09-001", "Gather the project’s resources into the post-production video editor"],
              ["REQ-09-002", "Apply some visual effects to the post-production video"],
              ["REQ-09-003", "Apply some sound effects to the post-production video"],
              ["REQ-09-004", "Render the final result of the post-production stage"],
            ],
          }],
        },
      ],
    },

    novels: {
      label: "Novels",
      icon: "book",
      sections: [
        {
          id: "novels", title: "Novels", headless: true,
          items: [{
            id: "novels", title: "Novel management", icon: "frames", cap: CAP["02"],
            blurb: "The workspace’s novel list. Each novel has three screens: Chapters (read, edit), Translation and Knowledgebase.",
            reqs: [
              ["REQ-02-001", "Create a new novel, or import one from a package file following the software’s structure"],
              ["REQ-02-002", "Reader and editor for the content of novels already in the software"],
              ["REQ-03-001", "Configure the translation guidelines and translation dictionary used by the AI"],
              ["REQ-04-001", "Analyze the novel’s content against the defined ontology"],
            ],
          }],
        },
      ],
    },

    library: {
      label: "Library",
      icon: "library",
      sections: [
        {
          id: "assets", title: "Library", headless: true,
          items: [
            {
              id: "images", title: "Images", icon: "image", cap: CAP["05"],
              blurb: "Upload and manage images in the workspace’s shared resource library.",
              reqs: [["REQ-05-001", "Upload IMAGES to the workspace’s shared resource library"]],
            },
            {
              id: "sounds", title: "Sounds", icon: "music", cap: CAP["05"],
              blurb: "Upload and manage sounds in the workspace’s shared resource library.",
              reqs: [["REQ-05-002", "Upload SOUNDS to the workspace’s shared resource library"]],
            },
            {
              id: "videos", title: "Videos", icon: "film", cap: CAP["05"],
              blurb: "Upload and manage videos in the workspace’s shared resource library.",
              reqs: [["REQ-05-003", "Upload VIDEOS to the workspace’s shared resource library"]],
            },
            {
              id: "prompts", title: "Prompts", icon: "prompt", cap: CAP["05"],
              blurb: "Upload and manage prompts shared in the workspace.",
              reqs: [["REQ-05-004", "Upload PROMPTS to the workspace’s shared resource library"]],
            },
            {
              id: "voices", title: "Voices", icon: "voice", cap: CAP["05"],
              blurb: "Clone a voice from an audio file or record yourself, and preview with a default voice or a cloned voice.",
              reqs: [
                ["REQ-05-006", "Clone a voice from an audio file or by recording"],
                ["REQ-05-007", "Preview a voice with a default voice or a cloned voice"],
              ],
            },
          ],
        },
        {
          id: "organize", title: "Classification",
          items: [{
            id: "collections", title: "Collections & tags", icon: "tag", cap: CAP["05"],
            blurb: "Classify and manage resources with collections and tags.",
            reqs: [["REQ-05-005", "Classification and resource management with collections and tags"]],
          }],
        },
      ],
    },

    distribution: {
      label: "Distribution",
      icon: "send",
      sections: [
        {
          id: "dist", title: "Distribution", headless: true,
          items: [
            {
              id: "channels", title: "Channels", icon: "globe", cap: CAP["10"],
              blurb: "Connect and manage content distribution channels.",
              reqs: [["REQ-10-001", "Connect and manage the distribution channels that are connected successfully"]],
            },
            {
              id: "packages", title: "Packages", icon: "package", cap: CAP["10"],
              blurb: "Prepare a package for a project to publish to distribution channels.",
              reqs: [["REQ-10-002", "Prepare a package for a project so it can be published to distribution channels"]],
            },
          ],
        },
      ],
    },
  };

  /** Pseudo-items (not in the explorer) — Assistant panel and Settings dialog. */
  const ASSISTANT = {
    cap: CAP["11"],
    blurb: "A smart assistant that helps you with every task.",
    reqs: [
      ["REQ-11-001", "Ask the Assistant to review results with the default request or a specific request"],
      ["REQ-11-002", "Explore more knowledge with the Assistant and give commands to edit and execute"],
    ],
  };

  const SETTINGS = [
    { id: "general", title: "General", icon: "settings", reqs: [["REQ-12-001", "A shared dialog to install and configure the software’s features - basics"]] },
    { id: "llm", title: "LLM providers", icon: "nodes", reqs: [["REQ-12-002", "Configure the LLM providers to use: a CLI installed on this machine or a cloud service"]] },
    { id: "backend", title: "Python backend", icon: "server", reqs: [["REQ-12-004", "Download and install TTS models that run on the Python local backend"]] },
    { id: "analysis", title: "Analysis providers", icon: "spark", reqs: [["REQ-12-006", "Configure the provider used for translation and knowledge analysis"]] },
    { id: "tts", title: "Local TTS models", icon: "cpu", reqs: [["REQ-12-004", "Download and install TTS models that run on the Python local backend"]] },
    { id: "speech", title: "Speech providers", icon: "cloud", reqs: [["REQ-12-005", "Configure the speech providers from cloud services"]] },
  ];

  /** Mock local TTS state used by the status bar and settings (not part of the loading splash). */
  const STARTUP_STEPS = [
    { id: "folder", label: "Check the workspace folder", detail: "Read / write permission", result: "ok" },
    { id: "config", label: "Read the workspace configuration", detail: "workspace.json", result: "ok" },
    { id: "index", label: "Load the catalog of projects, novels and library", detail: "Scan folders", result: "ok" },
    { id: "cli", label: "Detect installed CLI providers", detail: "Look on this machine", result: "ok" },
    { id: "executor", label: "Start the pipeline executor", detail: "Default concurrency", result: "ok" },
    { id: "tts", label: "Check the local TTS backend", detail: "FastAPI backend & models", result: "warn", note: "No TTS model installed. You can install one later in Settings." },
  ];

  const seedWorkspaces = [
    { path: "D:\\Dreamy Studio", name: "Dreamy Studio", lastOpened: "2026-11-09 21:12", projects: 6, size: "48.2 GB" },
    { path: "E:\\Archive\\Dreamy-2025", name: "Dreamy-2025", lastOpened: "2026-09-18 21:40", projects: 14, size: "212.7 GB" },
    { path: "C:\\Program Files\\Locked", name: "Locked", lastOpened: "2026-08-21 09:30", projects: 0, size: "1.2 MB", fail: { step: "workspace", code: "folder_not_writable", detail: "Access is denied. (os error 5)" } },
    { path: "F:\\USB\\dreamy-test", name: "dreamy-test", lastOpened: "2026-07-02 10:03", projects: 1, size: "—", status: "not_found", reason: "missing" },
    { path: "D:\\Documents\\novels.txt", name: "novels.txt", lastOpened: "2026-06-11 18:45", projects: 0, size: "—", status: "not_found", reason: "not_a_directory" },
    { path: "E:\\Private\\Dreamy", name: "Dreamy", lastOpened: "2026-05-27 14:20", projects: 2, size: "—", status: "not_found", reason: "no_access" },
  ];

  return { version: "0.0.0", CAP, NAV, ASSISTANT, SETTINGS, STARTUP_STEPS, seedWorkspaces };
})();
