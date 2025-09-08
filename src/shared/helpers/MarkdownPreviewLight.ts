import { marked } from "marked";

interface Props {
  value: string;
  textAlign?: "left" | "center" | "right";
}

export function MarkdownPreviewLight({ value: markdownString = "" }: Props) {
  const getTargetAndClasses = (extra: string) => {
    let result = "";
    const classRegex = /\.[^( |\})]+/g;
    const matches = extra.match(classRegex);
    if (matches && matches.length > 0) {
      let classes = matches.join(" ");
      classes = classes.replace(/\./g, "");
      result = ' class="' + classes + '"';
    }
    const targetRegex = /:target="([^"]+)"/g;
    const targets = targetRegex.exec(extra);
    if (targets) result += " " + targets[0].replace(":", "").replace("\\", "");
    return result;
  };

  // \[([^\]]+)\] - text
  // \(([^)]+)\) - url
  // \{([^\}]+)\} - target and classes
  // \[([^\]]+)\]\(([^)]+)\)\{([^\}]+)\} - full
  const getSpecialLinks = (markdownString: string) => {
    if (!markdownString) return "";
    const regex = /\[([^\]]+)\]\(([^)]+)\)\{([^\}]+)\}/g;
    const convertedText = markdownString.replace(regex, (match, text, url, extra) => {
      if (!match) return text;
      let result = '<a href="' + url + '"';
      result += getTargetAndClasses(extra);
      result += ">" + text + "</a>";
      return result;
    });
    return convertedText;
  };

  if (markdownString === null || markdownString === undefined || !markdownString) return "";
  else {
    const convertedText = getSpecialLinks(markdownString || "");
    let processedMarkdown = convertedText;
    processedMarkdown = convertedText.replace(/__(.*?)__/g, "<u>$1</u>"); //Replace `__underlined__` with `<u>underlined</u>`
    processedMarkdown = processedMarkdown.replace(/```([\s\S]+?)```/g, "<pre class='code-block'><code>$1</code></pre>"); //Convert block code ```code``` to <pre><code>code</code></pre>
    processedMarkdown = processedMarkdown.replace(/`([^`]+)`/g, "<code>$1</code>"); //Convert inline code `code` to <code>code</code>
    const html = marked.parse(processedMarkdown || "");
    //const style = (textAlign) ? { textAlign } : {}
    return html;
  }
}
