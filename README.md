# simonshine.dk

This site is made with [Zola][zola], a static site generator.

[zola]: https://www.getzola.org/

## Overview

The file [`config.toml`](./config.toml) contains basic settings.

To create or modify dynamic content (blog posts, tutorials, articles), go to
the relevant sub-directories in the [`content/`](./content) directory.  If you
want to include static content, like images, PDFs, or other downloads, they go
into the [`static/`](./static) directory. You can then link to those files by
assuming they're in the web root.

If you want to change the front page, or a similar layout-heavy page, or if you
want to change the way that dynamic content is rendered, or add another category
of dynamic content: that lives in the [`templates/`](./templates) directory.

Styling lives in the [`sass/`](./sass) directory.
 
## Running locally

Install the [Zola command-line tool][zola-install].

To statically generate the site, type `zola build`.

To automatically rebuild the site when files change, type `zola serve`.

[zola-install]: https://www.getzola.org/documentation/getting-started/installation/
