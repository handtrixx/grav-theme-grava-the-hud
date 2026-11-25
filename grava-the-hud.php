<?php
namespace Grav\Theme;

use Grav\Common\Grav;
use Grav\Common\Theme;

class GravaTheHud extends Theme
{
    public static function getSubscribedEvents()
    {
        return [
            'onThemeInitialized' => ['onThemeInitialized', 0],
            'onPageInitialized'  => ['onPageInitialized', 0],
            'onTwigLoader'       => ['onTwigLoader', 0],
            'onTwigInitialized'  => ['onTwigInitialized', 0],
        ];
    }

    public function onThemeInitialized()
    {
    }

    /**
     * Give every page under /wiki the docs layout and every blog post the
     * item layout, without touching the content files. Pages that set a
     * template themselves (Admin Next, the search page) keep it.
     */
    public function onPageInitialized()
    {
        $page = $this->grav['page'];
        $route = (string) $page->route();
        $header = $page->header();

        if (!isset($header->template)) {
            if (strpos($route, '/wiki') === 0) {
                $page->template('wiki');
            } else {
                // Blog posts carry no `template:` header (only title and date), so
                // without this they fall back to default.html.twig. Anything living
                // in a blog folder renders with the item template: header band,
                // date/tags, prev-next. The blog index itself stays on `blog`.
                $parent = $page->parent();
                if ($parent && basename((string) $parent->route()) === 'blog') {
                    $page->template('item');
                }
            }
        }

        // Front-matter dates over file mtime: GitSync re-checkouts every file
        // on deploy, so page->modified() is the deploy timestamp. Sitemap
        // lastmod, RSS feeds and date sorting all read it.
        if (isset($header->modified)) {
            $page->modified(strtotime((string) $header->modified));
            // Sitemap date_type is page_date; let `modified:` win there too.
            $header->sitemap = array_merge((array) ($header->sitemap ?? []),
                ['lastmod' => (string) $header->modified]);
        } elseif (isset($header->date)) {
            $page->modified(strtotime((string) $header->date));
        }

        // After the template decision: og:type and JSON-LD depend on it.
        $this->addSeoMetadata();
    }

    /**
     * SEO metadata, set here instead of in the content files so every page
     * gets the same treatment:
     * - a per-page `<meta name="description">` (front matter wins, otherwise
     *   the plain-text page summary);
     * - Open Graph + Twitter card tags, with the page's first image as og:image;
     * - `noindex` for the search route, whose result pages are thin queries
     *   (the sitemap already leaves them out).
     *
     * `partials/metadata.html.twig` prints `content` unescaped, so every
     * value is escaped here.
     */
    protected function addSeoMetadata()
    {
        if ($this->isAdmin()) {
            return;
        }
        $page = $this->grav['page'];
        $route = (string) $page->route();

        $meta = (array) ($page->metadata() ?? []);

        // metadata() returns normalized entries ({name|property, content}),
        // merged from site.yaml and the page's own front matter. Drop the
        // generic site description and rebuild it per page: front matter wins,
        // otherwise the plain-text page summary.
        $headerMeta = (array) ($page->header()->metadata ?? []);
        $description = '';
        foreach ($headerMeta as $key => $value) {
            if (is_array($value)) {
                $name = $value['name'] ?? $value['property'] ?? '';
                if ($name === 'description') {
                    $description = (string) ($value['content'] ?? '');
                    break;
                }
            } elseif (is_string($value) && $key === 'description') {
                $description = $value;
                break;
            }
        }
        if ($description === '') {
            // `description:` as a plain front-matter field (not nested under
            // `metadata:`) is how the content files carry it.
            $description = (string) ($page->header()->description ?? '');
        }
        if ($description === '') {
            $description = trim(preg_replace('/\s+/', ' ', (string) $page->summary(280, true)));
        }
        // Grav's summary builder escapes entities, so page markup leaks `&amp;`
        // (and `&amp;amp;`) into the text. Decode until stable, then escape once.
        for ($i = 0; $i < 3; $i++) {
            $decoded = html_entity_decode($description, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if ($decoded === $description) {
                break;
            }
            $description = $decoded;
        }
        $meta = array_values(array_filter(
            $meta,
            static fn ($entry) => !is_array($entry) || (($entry['name'] ?? $entry['property'] ?? '') !== 'description')
        ));
        if ($description !== '') {
            $meta[] = ['name' => 'description', 'content' => htmlspecialchars($description, ENT_QUOTES)];
        }

        // SimpleSearch dispatches its own synthetic page under the language
        // root, so match the template as well as the route name.
        if (basename($route) === 'search' || $page->template() === 'search') {
            $meta[] = ['name' => 'robots', 'content' => 'noindex, follow'];
        }

        $title = $this->stripEmoji((string) $page->title());
        // Wiki folders are listings, wiki articles have no children: the theme
        // renders both with the `wiki` template, so tell them apart here.
        $isWikiArticle = (string) $page->template() === 'wiki' && $page->children()->visible()->count() === 0;
        $ogType = in_array((string) $page->template(), ['item', 'wiki-article'], true) || $isWikiArticle ? 'article' : 'website';
        $lang = $this->grav['language']->getActive();
        $image = $this->firstPageImage($page);

        $tags = [
            ['property' => 'og:site_name', 'content' => (string) $this->config->get('site.title')],
            ['property' => 'og:type', 'content' => $ogType],
            ['property' => 'og:title', 'content' => $title],
            ['property' => 'og:url', 'content' => $page->url(true, true)],
            ['property' => 'og:locale', 'content' => $lang === 'de' ? 'de_DE' : 'en_US'],
            ['name' => 'twitter:card', 'content' => $image ? 'summary_large_image' : 'summary'],
            ['name' => 'twitter:title', 'content' => $title],
            ['name' => 'author', 'content' => (string) $this->config->get('site.author.name')],
        ];
        if ($description !== '') {
            $tags[] = ['property' => 'og:description', 'content' => $description];
            $tags[] = ['name' => 'twitter:description', 'content' => $description];
        }
        if ($image) {
            $tags[] = ['property' => 'og:image', 'content' => $image];
            $tags[] = ['name' => 'twitter:image', 'content' => $image];
        }
        foreach ($tags as &$tag) {
            $tag['content'] = htmlspecialchars($tag['content'], ENT_QUOTES);
        }

        $page->metadata(array_merge($meta, $tags));
    }

    /**
     * Absolute URL of the page's first media image, or null. Original file,
     * not a processed derivative, so it is large enough for social cards.
     */
    protected function firstPageImage($page)
    {
        try {
            foreach ($page->getMedia()->images() as $image) {
                $url = $image->url(true, true);
                if ($url !== '' && $url !== null) {
                    return $url;
                }
            }
        } catch (\Throwable $e) {
            // Media parsing must never break the page render.
        }
        return null;
    }

    /**
     * Server-side syntax highlighting for fenced code blocks, as a Twig filter
     * (`|highlight_code`) applied where a template renders full page content.
     *
     * Grav's markdown turns ```lang fences into
     * `<pre><code class="language-x">` with the code HTML-escaped.
     * highlight.php wants raw code and escapes its own output, so the block is
     * decoded, highlighted and re-wrapped in the markup the plugin's shortcodes
     * produce (`<pre class="hljs"><code class="hljs language-x">`); the token
     * classes are colored by custom.css in both theme states. Diagrams and
     * unsupported languages are left as plain code. Requires the highlight-php
     * plugin (it provides the library); disable with `code_highlighting: false`
     * in the theme config.
     *
     * Deliberately a render-time filter, NOT an onPageContentProcessed hook:
     * that event also fires for child pages whose content a listing builds
     * (wiki index section excerpts), where grav['page'] is the listing - each
     * child was then page-content-cached UN-highlighted and served plain on
     * every later hit (site-wide regression, 2026-11-25), and highlighting
     * every child's full content during one index request blew the 60 s
     * execution limit. Caching stays plain; templates highlight what they
     * render; advanced-pagecache stores the highlighted HTML, so repeat
     * visitors still skip all of it.
     */
    public function highlightCode(string $content = ''): string
    {
        if ($content === '' || $this->isAdmin()) {
            return $content;
        }
        if (!$this->config->get('themes.grava-the-hud.code_highlighting', true)) {
            return $content;
        }
        if (!class_exists('\Highlight\Highlighter')) {
            return $content; // highlight-php not installed: nothing to highlight with
        }
        if (strpos($content, '<pre><code class="language-') === false) {
            return $content;
        }

        // Languages that must keep their own rendering (or have no grammar).
        $skip = ['', 'text', 'plaintext', 'none', 'mermaid'];

        $highlighted = preg_replace_callback(
            '/<pre><code class="language-([A-Za-z0-9+#._-]+)">(.*?)<\/code><\/pre>/s',
            static function (array $m) use ($skip) {
                $lang = strtolower($m[1]);
                if (in_array($lang, $skip, true)) {
                    return $m[0];
                }
                $code = html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
                try {
                    $result = (new \Highlight\Highlighter())->highlight($lang, $code);
                    return '<pre class="hljs"><code class="hljs language-' . $result->language
                        . '">' . $result->value . '</code></pre>';
                } catch (\Throwable $e) {
                    return $m[0]; // no grammar for this language: leave it plain
                }
            },
            $content
        );

        return $highlighted ?? $content;
    }

    public function onTwigLoader()
    {
        $locator = Grav::instance()['locator'];
        foreach ((array) $locator->findResources('theme://images') as $path) {
            $this->grav['twig']->addPath($path, 'images');
        }
    }

    public function onTwigInitialized()
    {
        $twig = $this->grav['twig'];

        $form_class_variables = [
            'form_button_outer_classes' => 'button-wrapper',
            'form_button_classes'       => 'contrast',
            'form_errors_classes'       => 'form-errors',
            'form_field_outer_classes'  => 'form-group',
            'form_field_outer_label_classes' => 'form-label-wrapper',
            'form_field_label_classes'  => 'form-label',
            'form_field_input_classes'  => 'form-input',
            'form_field_textarea_classes' => 'form-input',
            'form_field_select_classes' => 'form-select',
            'form_field_radio_classes'  => 'form-radio',
            'form_field_checkbox_classes' => 'form-checkbox',
        ];

        $twig->twig_vars = array_merge($twig->twig_vars, $form_class_variables);

        $twig->twig->addFunction(new \Twig\TwigFunction('q2_mix_white', [$this, 'mixWithWhite']));
        $twig->twig->addFunction(new \Twig\TwigFunction('q2_mix_alpha', [$this, 'mixWithAlpha']));
        $twig->twig->addFilter(new \Twig\TwigFilter('fa_icon', [$this, 'faIconClass']));
        $twig->twig->addFilter(new \Twig\TwigFilter('without_first_heading', [$this, 'withoutFirstHeading']));
        $twig->twig->addFilter(new \Twig\TwigFilter('highlight_code', [$this, 'highlightCode']));
        $twig->twig->addFilter(new \Twig\TwigFilter('strip_images', [$this, 'stripImages']));
        $twig->twig->addFilter(new \Twig\TwigFilter('strip_emoji', [$this, 'stripEmoji']));

        // The zoo index lists the owner's GitHub repositories; the template
        // calls this function, so the fetch only happens on zoo pages.
        $twig->twig->addFunction(new \Twig\TwigFunction('github_repos', [$this, 'githubRepos']));

        // JSON-LD serializer for the structured-data partial. HEX_TAG keeps a
        // literal `</script>` inside a value from closing the script element.
        $twig->twig->addFunction(new \Twig\TwigFunction(
            'json_ld',
            static fn (array $data) => json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        ));

        // Plain text for structured data: Grav's summary builder escapes
        // entities from page markup; decode until stable.
        $twig->twig->addFilter(new \Twig\TwigFilter('plain_text', static function ($text) {
            $text = (string) $text;
            for ($i = 0; $i < 3; $i++) {
                $decoded = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if ($decoded === $text) {
                    break;
                }
                $text = $decoded;
            }
            return trim(preg_replace('/\s+/', ' ', $text));
        }));
    }

    /**
     * Public repositories of handtrixx, active ones first (newest push),
     * archived ones last. Fetched from the GitHub API and cached for 6 hours;
     * unauthenticated calls are limited to 60/h, one cached fetch per window
     * stays far below that. When the API is unreachable the zoo index falls
     * back to the curated item pages alone. A longer-lived copy (60 days) is
 * kept so a rate-limited fetch still shows the last known list.
     *
     * @return array<int, array{name: string, url: string, description: string,
     *     language: string, pushed: string, archived: bool, fork: bool}>
     */
    public function githubRepos(): array
    {
        $cache = Grav::instance()['cache'];
        $key = 'theme-github-repos';
        $staleKey = 'theme-github-repos-stale';
        $ttl = 21600; // 6h

        $repos = $cache->fetch($key);
        if (is_array($repos)) {
            return $repos;
        }

        $context = stream_context_create([
            'http' => [
                'timeout' => 6,
                'header' => "Accept: application/vnd.github+json\r\nUser-Agent: niklas-stephan.de-zoo",
            ],
        ]);
        $json = @file_get_contents('https://api.github.com/users/handtrixx/repos?per_page=100&sort=pushed', false, $context);
        $data = $json !== false ? json_decode($json, true) : null;
        if (!is_array($data) || !isset($data[0])) {
            // API unreachable or rate-limited: serve the last good list, however old.
            $stale = $cache->fetch($staleKey);
            return is_array($stale) ? $stale : [];
        }

        $repos = [];
        foreach ($data as $r) {
            if (!is_array($r) || !isset($r['name'])) {
                continue;
            }
            $repos[] = [
                'name' => (string) $r['name'],
                'url' => (string) ($r['html_url'] ?? ''),
                'description' => (string) ($r['description'] ?? ''),
                'language' => (string) ($r['language'] ?? ''),
                'pushed' => (string) ($r['pushed_at'] ?? ''),
                'archived' => (bool) ($r['archived'] ?? false),
                'fork' => (bool) ($r['fork'] ?? false),
            ];
        }

        usort($repos, static function (array $a, array $b) {
            if ($a['archived'] !== $b['archived']) {
                return $a['archived'] <=> $b['archived'];
            }
            return strcmp($b['pushed'], $a['pushed']);
        });

        $cache->save($key, $repos, $ttl);
        $cache->save($staleKey, $repos, 5184000); // 60d fallback
        return $repos;
    }

    /**
     * Turn an icon value into the Font Awesome classes that render it.
     *
     * Icon values reach a template in several shapes. Admin Next's icon picker
     * stores a solid icon as `fa-house` and the other families as
     * `fa-brands fa-github`; a value typed by hand, or carried over from a
     * Grav 1 site, arrives bare (`house`) or in the old Font Awesome 4 form
     * (`fa fa-house`). The templates used to write `fa-solid fa-{{ icon }}`,
     * which turns a picked `fa-house` into `fa-solid fa-fa-house` and renders
     * nothing, so an icon disappeared the moment it was changed in the admin
     * (getgrav/grav-skeleton-onepage-site#20).
     *
     * @param string|null $icon
     * @return string
     */
    public function faIconClass(?string $icon): string
    {
        $icon = trim((string) $icon);
        if ($icon === '') {
            return '';
        }

        $families = [
            'fa-solid'   => 'fa-solid',   'fas' => 'fa-solid',
            'fa-regular' => 'fa-regular', 'far' => 'fa-regular',
            'fa-brands'  => 'fa-brands',  'fab' => 'fa-brands',
        ];

        $family = '';
        $name   = '';

        foreach (preg_split('/\s+/', $icon) ?: [] as $token) {
            if (isset($families[$token])) {
                $family = $families[$token];
                continue;
            }
            // A bare `fa` or `fa-classic` names the family without naming a
            // glyph, so it must not be mistaken for the icon name.
            if ($token === 'fa' || $token === 'fa-classic') {
                continue;
            }
            $name = preg_replace('/^fa-/', '', $token);
        }

        if ((string) $name === '') {
            return '';
        }

        return ($family !== '' ? $family : 'fa-solid') . ' fa-' . $name;
    }

    /**
     * Drop the first `<h1>` from rendered content.
     *
     * Pages carry their title in the markdown body (`# git`), but every page
     * now speaks with one terminal header band above the layout columns, so
     * the body heading would repeat it inside the content column.
     */
    public function withoutFirstHeading(string $content): string
    {
        return preg_replace('/<h1\b[^>]*>.*?<\/h1>/is', '', $content, 1) ?? $content;
    }

    /**
     * Remove images (and the figures and empty paragraphs they leave behind)
     * from rendered content, so listing previews never draw a picture.
     */
    public function stripImages(string $content): string
    {
        $content = preg_replace('/<figure\b[^>]*>.*?<\/figure>/is', '', $content) ?? $content;
        $content = preg_replace('/<img\b[^>]*>/i', '', $content) ?? $content;
        $content = preg_replace('/<(p|div)\b[^>]*>\s*(?:<br\s*\/?>\s*)*<\/\1>/i', '', $content) ?? $content;
        return $content;
    }

    /**
     * Remove emoji and other decorative symbols (and the zero-width joiners
     * and variation selectors glued to them) from titles and excerpts, so
     * the terminal header band reads as plain text.
     */
    public function stripEmoji(string $text): string
    {
        // Symbol/pictogram classes catch most emoji; variation selectors
        // (FE00–FE0F), zero-width joiners and soft hyphens sit outside them.
        $text = preg_replace('/[\p{So}\p{Sk}\p{Cf}\x{AD}\x{200B}-\x{200D}\x{FE00}-\x{FE0F}]/u', '', $text) ?? $text;
        return trim($text);
    }

    public function mixWithWhite(string $hex, int $pct): string
    {
        [$r, $g, $b] = $this->parseHex($hex);
        $f = max(0, min(100, $pct)) / 100;
        $mr = (int) round($r * $f + 255 * (1 - $f));
        $mg = (int) round($g * $f + 255 * (1 - $f));
        $mb = (int) round($b * $f + 255 * (1 - $f));
        return "rgb({$mr}, {$mg}, {$mb})";
    }

    public function mixWithAlpha(string $hex, int $pct): string
    {
        [$r, $g, $b] = $this->parseHex($hex);
        $a = round(max(0, min(100, $pct)) / 100, 2);
        return "rgba({$r}, {$g}, {$b}, {$a})";
    }

    private function parseHex(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        if (strlen($hex) < 6) {
            return [0, 0, 0];
        }
        return [
            hexdec(substr($hex, 0, 2)),
            hexdec(substr($hex, 2, 2)),
            hexdec(substr($hex, 4, 2)),
        ];
    }
}
