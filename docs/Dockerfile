FROM debian:bookworm-slim

# Install only the TeX Live packages needed by relazione.tex
RUN apt-get update && apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-latex-extra \
        texlive-lang-italian \
        texlive-fonts-recommended \
        texlive-science \
        texlive-pictures \
        lmodern \
        latexmk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /docs

# Flags comuni a tutti i modi di avvio
ENTRYPOINT ["latexmk", "-pdf", "-interaction=nonstopmode"]
# Modalità one-shot (usata da `make compile` / `docker run`)
CMD ["-halt-on-error", "relazione.tex"]
