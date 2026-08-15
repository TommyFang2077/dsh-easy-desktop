PYTHON      ?= python3
CARGO       ?= cargo
PREFIX      ?= $(HOME)/.local
APP_ID      := io.github.tommyfang.DshDesktop
DSH_VERSION := 0.1.0-rc.6
MODLENS_VERSION := 3.16.6
ANCHORED_COMMIT := ffb845c5480adc953392a6db6f8a98ede621174b
ANCHORED_REPO := https://github.com/xiaobright/dsh-anchored-standard.git
VENDOR_DIR  := vendor/dsh-prefix
MODLENS_DIR := vendor/modlens
ANCHORED_DIR := vendor/anchored-standard
ZERO_DIR := vendor/zero-anchored-standard
FLATPAK     ?= flatpak
BUILDER     ?= flatpak run --user org.flatpak.Builder
BUILD_DIR   ?= .flatpak-build
REPO_DIR    ?= .flatpak-repo
MANIFEST    := flatpak/$(APP_ID).yml
VERSION     := $(shell sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)
BUNDLE      := dist/$(APP_ID)-$(VERSION).flatpak
BIN         := target/release/dsh-desktop

.PHONY: all run dev test vendor vendor-native vendor-anchored build install uninstall flatpak-build flatpak-export flatpak-install flatpak-bundle flatpak-run clean

all: test

run:
	$(CARGO) run -p dsh-desktop -- --no-update

dev:
	$(CARGO) run -p dsh-desktop -- --dev --verbose

build:
	$(CARGO) build -p dsh-desktop --release

test:
	$(CARGO) test -p dsh-core
	$(PYTHON) -m unittest discover -s tests -v

vendor:
	mkdir -p vendor
	rm -rf $(VENDOR_DIR) $(MODLENS_DIR)
	npm install --prefix=$(CURDIR)/$(VENDOR_DIR) --global --prefer-offline --no-audit --no-fund @deepseek-ai/dsh@$(DSH_VERSION)
	npm install --prefix=$(CURDIR)/$(MODLENS_DIR) --prefer-offline --no-audit --no-fund @liustack/modlens@$(MODLENS_VERSION)
	$(MAKE) vendor-anchored

vendor-native:
	MODLENS_VERSION=$(MODLENS_VERSION) ANCHORED_COMMIT=$(ANCHORED_COMMIT) ANCHORED_REPO=$(ANCHORED_REPO) bash scripts/vendor-native.sh

vendor-anchored:
	rm -rf vendor/.anchored-src $(ANCHORED_DIR) $(ZERO_DIR)
	mkdir -p vendor/.anchored-src
	git -C vendor/.anchored-src init --initial-branch=main
	git -C vendor/.anchored-src remote add origin $(ANCHORED_REPO)
	git -C vendor/.anchored-src fetch --depth 1 origin $(ANCHORED_COMMIT)
	git -C vendor/.anchored-src checkout --detach FETCH_HEAD
	mkdir -p $(ANCHORED_DIR) $(ZERO_DIR)
	cp -R vendor/.anchored-src/preset/. $(ANCHORED_DIR)/
	cp -R vendor/.anchored-src/zero-anchored-standard/. $(ZERO_DIR)/
	cp vendor/.anchored-src/LICENSE vendor/.anchored-src/NOTICE $(ANCHORED_DIR)/
	cp vendor/.anchored-src/LICENSE vendor/.anchored-src/NOTICE $(ZERO_DIR)/
	printf '%s\n' $(ANCHORED_COMMIT) > $(ANCHORED_DIR)/.dsh-desktop-source
	printf '%s\n' $(ANCHORED_COMMIT) > $(ZERO_DIR)/.dsh-desktop-source
	$(PYTHON) scripts/localize_preset.py $(ANCHORED_DIR)/preset.yml
	$(PYTHON) scripts/localize_preset.py $(ZERO_DIR)/preset.yml zero
	rm -rf vendor/.anchored-src

install: build
	install -Dm755 $(BIN) $(DESTDIR)$(PREFIX)/bin/dsh-desktop
	install -Dm644 data/applications/$(APP_ID).desktop $(DESTDIR)$(PREFIX)/share/applications/$(APP_ID).desktop
	install -Dm644 data/metainfo/$(APP_ID).metainfo.xml $(DESTDIR)$(PREFIX)/share/metainfo/$(APP_ID).metainfo.xml
	for size in 16 24 32 48 64 128 256 512; do \
		install -Dm644 "data/icons/hicolor/$${size}x$${size}/apps/$(APP_ID).png" "$(DESTDIR)$(PREFIX)/share/icons/hicolor/$${size}x$${size}/apps/$(APP_ID).png"; \
	done
	if [ -z "$(DESTDIR)" ]; then \
		update-desktop-database "$(PREFIX)/share/applications" >/dev/null 2>&1 || true; \
	fi
	if [ -d $(MODLENS_DIR)/node_modules/@liustack/modlens ]; then \
		rm -rf $(DESTDIR)$(PREFIX)/share/dsh-desktop/modlens; \
		mkdir -p $(DESTDIR)$(PREFIX)/share/dsh-desktop; \
		cp -R $(MODLENS_DIR) $(DESTDIR)$(PREFIX)/share/dsh-desktop/modlens; \
	fi
	if [ -f plugins/dsh-desktop-vision/package.json ]; then \
		rm -rf $(DESTDIR)$(PREFIX)/share/dsh-desktop/vision; \
		mkdir -p $(DESTDIR)$(PREFIX)/share/dsh-desktop; \
		cp -R plugins/dsh-desktop-vision $(DESTDIR)$(PREFIX)/share/dsh-desktop/vision; \
	fi
	if [ -f $(ANCHORED_DIR)/preset.yml ]; then \
		rm -rf $(DESTDIR)$(PREFIX)/share/dsh-desktop/anchored-standard; \
		mkdir -p $(DESTDIR)$(PREFIX)/share/dsh-desktop; \
		cp -R $(ANCHORED_DIR) $(DESTDIR)$(PREFIX)/share/dsh-desktop/anchored-standard; \
	fi
	if [ -f $(ZERO_DIR)/preset.yml ]; then \
		rm -rf $(DESTDIR)$(PREFIX)/share/dsh-desktop/zero-anchored-standard; \
		mkdir -p $(DESTDIR)$(PREFIX)/share/dsh-desktop; \
		cp -R $(ZERO_DIR) $(DESTDIR)$(PREFIX)/share/dsh-desktop/zero-anchored-standard; \
	fi
	@echo "installed to $(PREFIX) — make sure $(PREFIX)/bin is on PATH"

uninstall:
	rm -f $(DESTDIR)$(PREFIX)/bin/dsh-desktop
	rm -rf $(DESTDIR)$(PREFIX)/share/dsh-desktop
	rm -f $(DESTDIR)$(PREFIX)/share/applications/$(APP_ID).desktop
	rm -f $(DESTDIR)$(PREFIX)/share/metainfo/$(APP_ID).metainfo.xml
	for size in 16 24 32 48 64 128 256 512; do \
		rm -f "$(DESTDIR)$(PREFIX)/share/icons/hicolor/$${size}x$${size}/apps/$(APP_ID).png"; \
	done

flatpak-build: $(VENDOR_DIR)/bin/dsh $(MODLENS_DIR)/node_modules/@liustack/modlens $(ANCHORED_DIR)/preset.yml $(ZERO_DIR)/preset.yml
	$(BUILDER) --user --force-clean --install-deps-from=flathub $(BUILD_DIR) $(MANIFEST)

$(VENDOR_DIR)/bin/dsh:
	$(MAKE) vendor

$(MODLENS_DIR)/node_modules/@liustack/modlens:
	$(MAKE) vendor

$(ANCHORED_DIR)/preset.yml $(ZERO_DIR)/preset.yml:
	$(MAKE) vendor-anchored

flatpak-export:
	$(FLATPAK) build-export $(REPO_DIR) $(BUILD_DIR) master

flatpak-install: flatpak-build flatpak-export
	$(FLATPAK) --user install -y "$(CURDIR)/$(REPO_DIR)" $(APP_ID)

flatpak-bundle: flatpak-build flatpak-export
	mkdir -p dist
	$(FLATPAK) build-bundle $(REPO_DIR) "$(BUNDLE)" $(APP_ID) master

flatpak-run:
	$(FLATPAK) run $(APP_ID)

clean:
	$(CARGO) clean
	rm -rf $(BUILD_DIR) $(REPO_DIR) build dist
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
