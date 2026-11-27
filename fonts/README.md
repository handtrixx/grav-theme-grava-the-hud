Theme webfonts use content-hashed filenames (`name.<sha256[:10]>.woff2`) because
Apache serves /user/themes|plugins fonts with `Cache-Control: immutable`
(nsde-grav `zz-nsde-cache.conf`) and the url() refs inside fonts.css/custom.css
get no Grav timestamp. When you replace a font, rename with a fresh hash:
    sha256sum newfile.woff2 | cut -c1-10
and update fonts.css, custom.css (JetBrains Mono block) and the two preload
links in templates/partials/base.html.twig. Same convention for the FA subset
in css/fontawesome/.
