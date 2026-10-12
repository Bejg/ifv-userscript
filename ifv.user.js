// ==UserScript==
// @name         Improvements for Vulcan
// @name:pl      Ulepszenia dla VULCAN
// @namespace    https://github.com/Bejg/ifv-userscript
// @version      1.2.1
// @description  Poprawia uciążliwe elementy stron usług eduVULCAN oraz Dziennik Vulcan (port rozszerzenia banocean/ifv na userscript).
// @author       Bejg (userscript port); banocean (oryginalne rozszerzenie)
// @homepageURL  https://github.com/Bejg/ifv-userscript
// @supportURL   https://github.com/Bejg/ifv-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Bejg/ifv-userscript/main/ifv.user.js
// @updateURL    https://raw.githubusercontent.com/Bejg/ifv-userscript/main/ifv.user.js
// @license      MIT
// @match        *://dziennik-uczen.vulcan.net.pl/*
// @match        *://dziennik-wiadomosci.vulcan.net.pl/*
// @match        *://uczen.eduvulcan.pl/*
// @match        *://wiadomosci.eduvulcan.pl/*
// @match        *://dziennik-logowanie.vulcan.net.pl/*
// @match        *://eduvulcan.pl/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
    "use strict";

    const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    const OPTIONS_KEY = "IFV_OPTIONS";
    const PATCH_SETTINGS_KEY = "IFV_PATCH_SETTINGS";

    const loadOptions = () => {
        try {
            return GM_getValue(OPTIONS_KEY, {}) || {};
        } catch (e) {
            return {};
        }
    };
    const saveOptions = (options) => {
        try {
            GM_setValue(OPTIONS_KEY, options);
        } catch (e) {
            console.error("[IFV]", e);
        }
    };
    const loadPatchSettings = () => {
        try {
            return GM_getValue(PATCH_SETTINGS_KEY, {}) || {};
        } catch (e) {
            return {};
        }
    };
    const savePatchSettings = (settings) => {
        try {
            GM_setValue(PATCH_SETTINGS_KEY, settings);
        } catch (e) {
            console.error("[IFV]", e);
        }
    };

    const isMobileView = () => window.innerWidth < 1024;
    const currentHost = () => W.location.hostname;

    const deviceOk = (devices) => {
        if (!devices) return true;
        if (devices === "mobileOnly") return isMobileView();
        if (devices === "desktopOnly") return !isMobileView();
        return true;
    };

    const SEARCH_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/search.svg";
    const CLEAR_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/clear.svg";
    const SETTINGS_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/settings.svg";
    const CLOSE_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/close.svg";
    const BACK_ICON =
        "https://raw.githubusercontent.com/banocean/ifv/new-navbar/assets/icons/keyboard_backspace_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg";
    const LOGO_RED =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/logo/logo-128-red.png";
    const LOGO_BLUE =
        "https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/logo/logo-128-blue.png";

    const MODULES = [];
    let didExecute = false;

    const appendModule = (module) => MODULES.push(module);

    const runModule = (module, isFirstRun) => {
        try {
            if (module.onlyOnReloads && !isFirstRun) return;
            if (module.doesRunHere !== undefined && !module.doesRunHere())
                return;

            if (!module.isLoaded || module.isLoaded()) {
                module.run();
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                let ready = false;
                try {
                    ready = module.isLoaded();
                } catch (e) {
                    ready = false;
                }
                if (!ready) return;
                obs.disconnect();
                try {
                    module.run();
                } catch (e) {
                    console.error("[IFV]", e);
                }
            });
            observer.observe(document.body, { subtree: true, childList: true });
        } catch (e) {
            console.error("[IFV]", e);
        }
    };

    const execute = () => {
        if (!MODULES.length)
            console.warn("[IFV] Uruchomiono bez włączonych patchy");
        const isFirstRun = !didExecute;
        didExecute = true;
        MODULES.forEach((module) => runModule(module, isFirstRun));
    };

    let lastLocation = W.location.pathname;

    W.history.pushState = new Proxy(W.history.pushState, {
        apply: (target, thisArg, args) => {
            const isPathnameChanged =
                args.length >= 3
                    ? W.location.pathname !== args[2].split("#")[0]
                    : true;
            if (args.length >= 3) lastLocation = args[2].split("#")[0];
            const result = target.apply(thisArg, args);
            if (MODULES.length && isPathnameChanged) execute();
            return result;
        },
    });

    W.addEventListener("popstate", () => {
        const isPathnameChanged = W.location.pathname !== lastLocation;
        if (MODULES.length && isPathnameChanged) execute();
    });

    const waitForRender = async (fn, target = document.body) => {
        let resolve;
        const wait = new Promise((r) => (resolve = r));
        const observer = new MutationObserver((mutations, obs) => {
            if (!fn()) return;
            resolve();
            obs.disconnect();
        });
        observer.observe(target, { subtree: true, childList: true });
        if (!fn()) await wait;
    };

    const waitForReplacement = async (fn, target = document.body) => {
        const initialElement = fn();
        if (!initialElement) return waitForRender(fn, target);

        let resolveDisappear;
        const waitForDisappear = new Promise((r) => (resolveDisappear = r));
        const disappearObserver = new MutationObserver((mutations, obs) => {
            if (!document.body.contains(initialElement)) {
                resolveDisappear();
                obs.disconnect();
            }
        });
        disappearObserver.observe(target, { subtree: true, childList: true });

        await waitForDisappear;
        return waitForRender(fn, target);
    };

    let asideMode;
    let asideReads = 0;

    const getAsideElement = async () => {
        if (asideMode === "hidden" && document.querySelector("aside"))
            return document.querySelector("aside");

        asideReads++;
        if (!document.querySelector("aside"))
            document.querySelector(".header__hamburger__icon button").click();
        await waitForRender(() => document.querySelector("aside"));
        document.querySelector("aside").classList.add("hideAside");
        return document.querySelector("aside");
    };

    const closeAside = () => {
        const closeButton = document.querySelector(".aside-button--close");
        if (asideMode !== "hidden") {
            asideReads--;
            if (closeButton && asideReads <= 0) closeButton.click();
            document.querySelector("aside")?.classList?.remove("hideAside");
        }
    };

    const executeActionOnAside = async (fn) => {
        const aside = await getAsideElement();
        await fn(aside);
        if (!document.querySelector("aside") && asideMode === "hidden") {
            document
                .querySelector(".header__hamburger__icon button")
                .click();
        } else asideReads--;
    };

    const clickOnAside = (selector) =>
        executeActionOnAside((aside) => aside.querySelector(selector)?.click());

    const getFromAside = async (fn) => {
        const aside = await getAsideElement();
        const result = await fn(aside);
        closeAside();
        return result;
    };

    const isMessagesHost = () =>
        /(dziennik-)?wiadomosci.*/.test(W.location.hostname);

    const getUserData = async () =>
        getFromAside(async () => {
            await waitForRender(
                () =>
                    document.querySelector(
                        isMessagesHost()
                            ? ".account__name span"
                            : ".side_important-text.side_student",
                    ) && document.querySelector(".user div:nth-child(2)"),
            );

            return {
                fullName: isMessagesHost()
                    ? document
                          .querySelector(".account__name span")
                          ?.firstChild?.textContent?.split(" ")
                          .reverse()
                          .join(" ")
                    : document.querySelector(".side_important-text.side_student")
                          ?.textContent,
                username: document.querySelector(".user div:nth-child(2)")
                    .lastChild.textContent,
            };
        });

    const normalizeLesson = (lesson) => {
        const hoursText = (
            lesson.querySelector(
                ".position__lesson__hours, .conflicted--details--hours",
            )?.innerText || "  "
        ).split(" ");
        const startingHour = hoursText[0];
        const endingHour = hoursText[2];

        const subjectText =
            lesson
                .querySelector(".position__lesson__subject")
                ?.innerText?.split(/ Grupa-| \|/) || [];

        const annotationText = lesson.querySelector(
            ".plan-position__adnotation-title",
        )?.innerText;

        const type = lesson.classList.contains("cell--multi--conflicted")
            ? "conflicted"
            : lesson.querySelector(".zastepstwo")
              ? "substitute"
              : lesson.querySelector(".odwolane")
                ? "canceled"
                : annotationText
                  ? "unknown"
                  : "normal";

        return {
            originalElement: lesson,
            type,
            subject: subjectText[0],
            group: subjectText[1],
            teacher: lesson.querySelector(".position__lesson__teacher")
                ?.innerText,
            classroom: [
                ...(lesson.querySelector(
                    ".position__lesson__subject + span",
                )?.innerText || ""),
            ]
                .filter((c) => !"()".includes(c))
                .join("")
                .trim(),
            annotationText,
            startingHour,
            endingHour,
        };
    };

    const mapDay = (element) =>
        Array.from(
            element.querySelectorAll(".cell--single, .cell--multi--conflicted"),
        ).map(normalizeLesson);

    const updateReactInput = (input, value) => {
        const setValue = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(input),
            "value",
        ).set;
        const event = new Event("input", { bubbles: true });
        setValue.call(input, value);
        input.dispatchEvent(event);
    };

    const dayNames = [
        "poniedziałek",
        "wtorek",
        "środa",
        "czwartek",
        "piątek",
        "sobota",
        "niedziela",
    ];

    const getWeekStartingMonday = (i) => (i === 0 ? 6 : i - 1);

    const getWeek = (date) => {
        const DAY = 24 * 60 * 60 * 1000;
        const firstDay = new Date(`${date.getFullYear()}-01-01`);
        return Math.floor((date.getTime() - firstDay.getTime()) / DAY / 7);
    };

    const isSameWeek = (date, comparedDate) =>
        getWeek(date) === getWeek(comparedDate);

    class SelectorRenderer {
        constructor(renderContentFn) {
            this.renderContent = renderContentFn;
            this.#render().then(() =>
                console.debug("[IFV] Rendered date selector"),
            );
        }

        #createSelector(dayName) {
            const element = document.createElement("div");
            element.innerHTML = `
                <input type="date">
                <div>
                    <img src='https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/chevron_left_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg'>
                    <span></span>
                    <img src='https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/chevron_right_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg'>
                </div>
            `;

            const dayDisplay = element.querySelector("span");
            dayDisplay.innerText = dayName;
            dayDisplay.addEventListener("click", () =>
                element.querySelector("input").showPicker(),
            );

            const datePicker = element.querySelector("input");
            datePicker.addEventListener("change", () =>
                this.#setDay(datePicker.value, datePicker.valueAsDate),
            );

            element
                .querySelector("img:first-of-type")
                .addEventListener("click", () => this.#setSiblingDay(-1));
            element
                .querySelector("img:last-of-type")
                .addEventListener("click", () => this.#setSiblingDay(1));
            element.classList.add("date-selector");

            return element;
        }

        #updateSelectorDate(name) {
            document.querySelector(".date-selector span").innerText = name;
        }

        #getDaysDropdowns() {
            return Array.from(
                document.querySelectorAll(".app__content .MuiPaper-root"),
            ).map((element) => ({
                element,
                note: element.querySelector(".plan-zajec__accordion__wolne")
                    ?.innerText,
                day: element.querySelector(
                    ".MuiAccordionSummary-content > h2",
                )?.innerText,
            }));
        }

        #isDayListLoaded() {
            return !document.querySelector(".spinner") && this.#isWeekChanged();
        }

        #isWeekChanged() {
            return (
                !this.firstDayName ||
                document.querySelector(
                    ".app__content .MuiPaper-root .MuiAccordionSummary-content > h2",
                )?.innerText !== this.firstDayName
            );
        }

        async #setDay(value, valueDate) {
            if (
                !isSameWeek(
                    document.querySelector(".week-selector input").valueAsDate,
                    valueDate,
                )
            ) {
                this.#setChecking();
                if (!value || !valueDate) return;
                updateReactInput(
                    document.querySelector(".week-selector input"),
                    value,
                );
                await waitForRender(() => this.#isDayListLoaded());
            }

            this.currentWeekDay = Math.min(
                getWeekStartingMonday(valueDate.getDay()),
                this.cachedWeek.length - 1,
            );
            await this.#render();
        }

        async #setupAutoRender() {
            if (this.observer) return;
            this.observer = new MutationObserver(async () => {
                const content = await this.renderContent(
                    this.cachedWeek[this.currentWeekDay],
                );
                content.classList.add("day-content");
                document.querySelector(".day-content").replaceWith(content);
            });

            this.observer.observe(
                document.querySelector(
                    ".content-container__tab-subheader:has(.week-selector) + div",
                ),
                { childList: true, subtree: true },
            );
        }

        async #render() {
            let replaceable = document.querySelector(".day-content");
            if (!replaceable) {
                replaceable = document.createElement("div");
                document
                    .querySelector("section.app__content .mobile__frame")
                    .appendChild(replaceable);
            }

            this.cachedWeek = this.#getDaysDropdowns();

            if (this.currentWeekDay === undefined) {
                const today = new Date();
                const day = getWeekStartingMonday(today.getDay());
                this.currentWeekDay = this.cachedWeek.findIndex(
                    (timetableDay) =>
                        (timetableDay.day || "-, ")
                            .split(", ")[0]
                            .toLowerCase() === dayNames[day],
                );
                if (this.currentWeekDay === -1)
                    this.currentWeekDay = this.cachedWeek.length - 1;
            }

            const content = await this.renderContent(
                this.cachedWeek[this.currentWeekDay],
            );
            content.classList.add("day-content");
            replaceable.replaceWith(content);

            if (document.querySelector(".date-selector")) {
                this.#updateSelectorDate(
                    this.cachedWeek[this.currentWeekDay].day,
                );
            } else
                document
                    .querySelector("section.app__content .mobile__frame")
                    .appendChild(
                        this.#createSelector(
                            this.cachedWeek[this.currentWeekDay].day,
                        ),
                    );

            this.#setupAutoRender();
        }

        #setChecking() {
            this.firstDayName = this.cachedWeek[0].day;
        }

        async #setSiblingDay(direction = 1) {
            this.#setChecking();
            document.querySelector("#root").scroll(0, 0);

            const target = this.currentWeekDay + direction;
            if (target >= this.cachedWeek.length || target < 0) {
                if (target < 0) {
                    this.currentWeekDay = 4;
                    document
                        .querySelector(".week-selector > button:first-of-type")
                        .click();
                } else {
                    this.currentWeekDay = 0;
                    document
                        .querySelector(".week-selector > button:last-of-type")
                        .click();
                }
                await waitForRender(() => this.#isDayListLoaded());
            } else {
                this.currentWeekDay = target;
            }

            await this.#render();
        }
    }

    const updateTitle = () => {
        const header = document.querySelector(".header__logo-product > span");
        const title = document.querySelector(
            ".app__content__header__h1_subtitle > h1",
        );
        if (header && title?.innerText && header.innerText !== title.innerText)
            header.innerText = title.innerText;
    };

    const moveTitleToHeader = () => {
        const header = document.querySelector(".header__logo-product");
        header.appendChild(document.createElement("span"));
        updateTitle();

        const observer = new MutationObserver(updateTitle);
        observer.observe(document.querySelector(".app__content"), {
            characterData: true,
            childList: true,
            subtree: true,
        });

        let button = document.querySelector(".go_to_dashboard");
        if (!button) {
            button = document.createElement("span");
            button.className = "go_to_dashboard";
        }
        button.innerHTML =
            "<img src='https://raw.githubusercontent.com/banocean/ifv/main/assets/icons/reply_24dp_000000_FILL0_wght400_GRAD0_opsz24.svg'> Tablica";
        button.classList.add("hidden");
        document.body.appendChild(button);

        header.addEventListener("click", () => button.classList.toggle("hidden"));

        button.addEventListener("click", async () => {
            button.classList.toggle("hidden");
            if (isMessagesHost()) {
                W.location.replace(
                    `https://${W.location.hostname.replace("wiadomosci", "uczen")}/${W.location.pathname.split("/")[1]}/App`,
                );
            } else await clickOnAside(".tablica a");
        });
    };

    const moveMessagesButton = async () => {
        const inner = await getFromAside(async () => {
            await waitForRender(() => document.querySelector(".messages"));
            return document.querySelector(".messages")?.innerHTML;
        });

        const messages = document.createElement("div");
        messages.innerHTML = inner;
        messages.style.float = "right";
        messages.style.padding = "20px";
        messages.style.marginLeft = "auto";
        messages.querySelector(
            ".MuiBadge-anchorOriginTopRightRectangle",
        ).style.transitionDuration = "0ms";

        document
            .querySelector(".header_logo_tools-container")
            .appendChild(messages);
    };

    const hideEmptyColumns = async () => {
        await waitForRender(() =>
            document.querySelector(".p-datatable-table .details-btn--appearance"),
        );

        const headers = document.querySelectorAll(".p-datatable-table th");
        headers.forEach((header, idx) => {
            const cells = Array.from(
                document.querySelectorAll(
                    "tbody tr td:nth-child(" + (idx + 1) + ")",
                ),
            );
            const check = cells.some(
                (cell) => cell.textContent.trim().length > 0,
            );

            const columnCells = document.querySelectorAll(
                "tr th:nth-child(" +
                    (idx + 1) +
                    "), tr td:nth-child(" +
                    (idx + 1) +
                    ")",
            );
            columnCells.forEach((cell) => {
                cell.style.display = check ? "" : "none";
            });
        });
    };

const prepGrades = async () => {
        if (window.innerWidth > 1024) {
            await waitForRender(() =>
                document.querySelector(".MuiTabs-flexContainer > button"),
            );

            hideEmptyColumns();
            document
                .querySelectorAll(".MuiTabs-flexContainer > button")
                .forEach((e) => {
                    e.addEventListener("click", async () => {
                        await waitForReplacement(() =>
                            document.querySelector(
                                ".p-datatable-table .details-btn--appearance",
                            ),
                        );
                        hideEmptyColumns();
                    });
                });
        } else {
            await waitForRender(() =>
                document.querySelector(
                    ".MuiAccordionDetails-root.accordion__full-width__content > .mobile__frame .grades__box",
                ),
            );
            document
                .querySelectorAll(
                    ".MuiAccordionDetails-root.accordion__full-width__content > .mobile__frame",
                )
                .forEach(async (semester) => {
                    await waitForRender(() =>
                        semester.querySelector(
                            ".MuiAccordionDetails-root .grades__box .info-row .info-text > span",
                        ),
                    );
                    semester.querySelectorAll(".info-row").forEach((e) => {
                        if (
                            e
                                .querySelector(".info-text > span")
                                .textContent.trim() === "" ||
                            e
                                .querySelector(".info-text > span")
                                .textContent.trim() === "0"
                        ) {
                            e.remove();
                        }
                    });
                    // Transform grade boxes into compact journal-style rows
                    semester
                        .querySelectorAll(".grades__box")
                        .forEach((box) => {
                            const header = box.querySelector(".grades__subject");
                            if (!header) return;
                            const nameEl = header.querySelector(".right-gap");
                            const detailsBtn = header.querySelector(
                                "button[aria-label*='Szczegóły']",
                            );
                            const gradeBtns = box.querySelectorAll(
                                ".grades__button__one-grade",
                            );
                            const avgEl = box.querySelector(".info-text > span");

                            const subjectName =
                                nameEl?.textContent?.trim() || "";
                            const grades = Array.from(gradeBtns).map((b) =>
                                b.textContent.trim(),
                            );
                            const gradeBtnElements = Array.from(gradeBtns);
                            const average = avgEl?.textContent?.trim() || "";

                            if (!subjectName) return;

                            const row = document.createElement("div");
                            row.className = "subject-row";
                            row.innerHTML = `
                                <div class="subject-info">
                                    <h3 class="subject-name">${subjectName}</h3>
                                    <div class="grades-list"></div>
                                </div>
                                <div class="subject-stats">
                                    <div class="average-box">
                                        <span class="average-label">Średnia</span>
                                        <span class="average-value">${average}</span>
                                    </div>
                                </div>
                            `;
                            const gradesList = row.querySelector(".grades-list");
                            // Move original grade buttons (preserve click handlers) and restyle as badges
                            gradeBtnElements.forEach((btn) => {
                                btn.classList.add("grade-badge");
                                btn.removeAttribute("style");
                                btn.removeAttribute("tabindex");
                                btn.setAttribute("type", "button");
                                gradesList.appendChild(btn);
                            });
                            if (detailsBtn) {
                                const stats = row.querySelector(".subject-stats");
                                const newBtn = detailsBtn.cloneNode(true);
                                newBtn.classList.add("details-btn");
                                newBtn.style.marginLeft = "8px";
                                stats.appendChild(newBtn);
                                detailsBtn.remove();
                            }
                            box.replaceWith(row);
                        });
                });
        }
    };

    const getStudentData = () =>
        isMessagesHost()
            ? document
                  .querySelector(".account__name span")
                  ?.firstChild?.textContent?.split(" ")
                  .reverse()
                  .join(" ")
            : document.querySelector(".side_student")?.firstChild?.textContent;

    const displayFullName = () => {
        const studentData = getStudentData();
        if (!studentData) return;

        const studentNameSpan = document.createElement("span");
        studentNameSpan.style = "font-size: 20px;";
        studentNameSpan.innerHTML = `${studentData}`;

        const usernameContainer = document.querySelector(
            ".user div:nth-of-type(2)",
        );
        usernameContainer.style =
            "display: flex; flex-direction: column; font-size: 16px;";
        usernameContainer.insertBefore(
            studentNameSpan,
            usernameContainer.firstChild,
        );
    };

    const isEduVulcan = () => !W.location.hostname.startsWith("dziennik");
    const getLogoElement = () =>
        document.querySelector(".header__logo-product")?.firstChild;

    const setUpRedirectToBoard = () => {
        const logoElement = getLogoElement();
        if (isMessagesHost()) {
            const url = `https://${W.location.hostname.replace("wiadomosci", "uczen")}/${W.location.pathname.split("/")[1]}/App`;
            if (isEduVulcan()) logoElement.href = url;
            else {
                logoElement.onclick = () => (W.location.href = url);
                logoElement.style = "cursor: pointer;";
            }
        } else {
            if (isEduVulcan()) logoElement.href = "javascript:void(0)";
            else logoElement.style = "cursor: pointer;";
            logoElement.addEventListener("click", () =>
                clickOnAside(".tablica a"),
            );
        }
    };

    const redirectToEVLogin = () => {
        W.location.pathname = "/logowanie";
    };

    const redirectToDVLogin = () => {
        W.location.pathname = `/${W.location.pathname.split("/")[1]}/LoginEndpoint.aspx`;
    };

    const addDvAlternativeLoginLink = () => {
        const pathSegment = W.location.pathname.split("/")[1];
        const targetSpan = document.querySelector(
            ".input-components ~ .form-gap > span",
        );
        if (!targetSpan) return;
        const spanHTML = targetSpan.innerHTML;
        const newHTML = spanHTML.slice(0, -1);
        const additionalText = `lub użyj <a href="https://uonetplus.vulcan.net.pl/${pathSegment}" class="link-simple">innej metody logowania</a>`;
        targetSpan.innerHTML = `${newHTML} ${additionalText}`;
    };

    const getManifestLink = (hostname) => {
        switch (hostname) {
            case "eduvulcan.pl":
                return "https://raw.githubusercontent.com/banocean/ifv/main/pwa/manifest-eduvulcan.json";
            case "uczen.eduvulcan.pl":
            case "dziennik-uczen.vulcan.net.pl":
                return getLocalPwaManifestUrl(hostname);
        }
    };

    const getLocalPwaManifestUrl = (hostname) => {
        const isDziennik = hostname === "dziennik-uczen.vulcan.net.pl";
        const color = isDziennik ? "red" : "blue";
        const manifest = {
            name: isDziennik ? "Dziennik VULCAN" : "eduVULCAN",
            short_name: isDziennik ? "Dziennik VULCAN" : "eduVULCAN",
            start_url: W.location.href,
            display: "standalone",
            orientation: "portrait",
            background_color: isDziennik ? "#c22a2a" : "#006BD6",
            icons: [128, 192, 512].map((size) => ({
                src: `https://raw.githubusercontent.com/banocean/ifv/main/assets/logo/logo-${size}-${color}.png`,
                sizes: `${size}x${size}`,
                type: "image/png",
            })),
        };
        const blob = new W.Blob([JSON.stringify(manifest)], {
            type: "application/manifest+json",
        });
        return W.URL.createObjectURL(blob);
    };

    const injectWebManifest = () => {
        const metaLink = document.createElement("link");
        metaLink.setAttribute("rel", "manifest");
        metaLink.setAttribute("href", getManifestLink(W.location.hostname));
        document.head.appendChild(metaLink);
    };

    const startResizeListening = () => {
        const startingWidth = window.innerWidth;
        W.addEventListener("resize", () => {
            if (startingWidth < 1024 !== window.innerWidth < 1024)
                W.location.reload();
        });
    };

    const setupMobileNavbarState = () => {
        if (/^(dziennik-)?(uczen).*/.test(W.location.hostname))
            asideMode = "hidden";

        W.addEventListener("popstate", (e) => {
            const moreDetails = e.state?.moreDetails;
            if (moreDetails !== true) {
                if (e.state?.more) {
                    document.querySelector(".more-popup").style.display =
                        "block";
                } else {
                    document.querySelectorAll(".list-modal").forEach((el) => {
                        el.style.display = "none";
                    });
                }
            }
            setHighlights();
        });
    };

    const getAsidePages = (selector = "aside > section > .MuiList-root > ul") => {
        if (!document.querySelector("aside")) return [];
        return Array.from(document.querySelector(selector).children).map(
            (item) => {
                const isDirectLink =
                    item.classList.contains("MuiListItem-gutters");
                const icon = getComputedStyle(
                    isDirectLink ? item : item.querySelector("div > button"),
                    ":before",
                ).getPropertyValue("content");
                const name = item.querySelector(
                    isDirectLink ? "a" : ".accordion__title__content",
                )?.innerText;

                const items = isDirectLink
                    ? undefined
                    : Array.from(item.querySelector(".items").children);

                return {
                    type: isDirectLink ? 1 : 2,
                    element: item,
                    items,
                    icon,
                    name,
                };
            },
        );
    };

    const navIcons = {
        tablica: "dashboard",
        oceny: "counter_6",
        frekwencja: "event_available",
        planZajec: "calendar_clock",
    };

    const buildMobileNavbar = async () => {
        const nav = document.createElement("nav");
        nav.classList.add("bottom-navigation-bar");

        const more = document.createElement("div");
        more.classList.add("more-popup");
        more.classList.add("list-modal");
        more.innerHTML = `<div><img src='${BACK_ICON}'><h1>Więcej</h1></div><div></div>`;
        more.style.display = "none";

        more.querySelector("img").addEventListener("click", () => {
            more.style.display = "none";
            W.history.back();
            setHighlights();
        });

        await getFromAside(() => null);
        await waitForRender(() => getAsidePages().length > 1);

        const navPages = ["tablica", "oceny", "frekwencja", "planZajec"];
        const pages = getAsidePages();
        for (const page of pages) {
            const itemClass = Array.from(page.element.classList).find(
                (c) =>
                    ![
                        "MuiListItem-root",
                        "MuiListItem-gutters",
                        "selected",
                    ].includes(c),
            );
            const item = document.createElement("div");

            if (!navPages.includes(itemClass)) {
                item.innerHTML =
                    "<div class='icon'></div><span class='name'></span>";
                item.querySelector(".icon").style.content = page.icon;
                item.querySelector(".name").innerText = page.name;
                more.querySelector("div:last-of-type").appendChild(item);
            } else {
                item.innerHTML = `<div><img src="https://raw.githubusercontent.com/banocean/ifv/new-navbar/assets/icons/${navIcons[itemClass]}_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg"></div><div></div>`;
                item.querySelector("div:last-of-type").innerText = page.name;
                nav.appendChild(item);
            }

            if (page.type === 1) {
                item.addEventListener("click", () => {
                    document.querySelector(`.${itemClass} a`).click();
                    more.style.display = "none";
                    document
                        .querySelector(".header__hamburger__icon button")
                        .click();
                    document.querySelector("div#root").scroll(0, 0);
                    setHighlights();
                });
            } else {
                const detailedOptionsPage = document.createElement("div");
                detailedOptionsPage.innerHTML = `<div><img src='${BACK_ICON}'><h1></h1></div><div></div>`;
                detailedOptionsPage.style.zIndex = "4002";
                detailedOptionsPage.style.display = "none";
                detailedOptionsPage.classList.add("list-modal");

                detailedOptionsPage.querySelector("h1").innerText = page.name;
                detailedOptionsPage
                    .querySelector("img")
                    .addEventListener("click", () => {
                        W.history.back();
                    });

                for (let i = 0; i < page.items.length; i++) {
                    const option = page.items[i];
                    const element = document.createElement("div");
                    element.innerHTML =
                        "<div class='icon'></div><span class='name'></span>";
                    element.querySelector(".icon").style.content = page.icon;
                    element.querySelector(".name").innerText =
                        option.firstChild.innerText;
                    element.addEventListener("click", () => {
                        detailedOptionsPage.style.display = "none";
                        more.style.display = "none";
                        Array.from(
                            document.querySelectorAll(`.${itemClass} .items a`),
                        )[i].click();
                        document
                            .querySelector(".header__hamburger__icon button")
                            .click();
                        document.querySelector("div#root").scroll(0, 0);
                    });
                    detailedOptionsPage.lastElementChild.appendChild(element);
                }

                item.addEventListener("click", () => {
                    detailedOptionsPage.style.display = "block";
                    W.history.pushState(
                        { ...W.history.state, moreDetails: true },
                        "",
                        `${W.location.pathname}#${itemClass}`,
                    );
                });

                W.addEventListener("popstate", (e) => {
                    if (e.state?.moreDetails) {
                        detailedOptionsPage.style.display = "block";
                    } else {
                        detailedOptionsPage.style.display = "none";
                    }
                });

                document.body.appendChild(detailedOptionsPage);
            }
        }

        const moreButton = document.createElement("div");
        moreButton.innerHTML = `
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/main/assets/icons/menu_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg">
            </div>
            <div>Więcej</div>
        `;

        moreButton.addEventListener("click", () => {
            more.style.display = "block";
            W.history.pushState(
                { ...W.history.state, more: true },
                "",
                `${W.location.pathname}#more`,
            );
            setHighlights();
        });

        nav.appendChild(moreButton);

        document.body.appendChild(nav);
        document.body.appendChild(more);
    };

    const setHighlights = () => {
        let i;
        const morePopup = document.querySelector(".more-popup");
        if (morePopup?.style.display === "block") i = 4;
        else if (W.location.pathname.endsWith("tablica")) i = 0;
        else if (W.location.pathname.endsWith("oceny")) i = 1;
        else if (W.location.pathname.endsWith("frekwencja")) i = 2;
        else if (W.location.pathname.endsWith("planZajec")) i = 3;

        const buttons = Array.from(
            document.querySelector(".bottom-navigation-bar").children,
        );
        for (let j = 0; j < buttons.length; j++) {
            const img = buttons[j].querySelector("div > img");
            if (!img) continue;
            if (i === j) img.classList.add("highlight");
            else img.classList.remove("highlight");
        }
    };

    const setAutocomplete = () => {
        document
            .querySelector("#Login")
            ?.setAttribute("autocomplete", "username");
        document
            .querySelector("#Haslo")
            ?.setAttribute("autocomplete", "current-password");
    };

    // The current eduVULCAN login page is a two-step wizard whose "Dalej"
    // button is what initializes the proof-of-work captcha. To keep both
    // inputs visible at once we have to reproduce that step ourselves,
    // otherwise the captcha never starts and the login fails.
    const syncEduVulcanLoginCaptcha = () => {
        const alias = document.querySelector("#UserName")?.value?.trim() || "";
        const label = document.querySelector("#lblPassword");
        if (label) label.textContent = alias;

        const captcha = document.querySelector("#captcha");
        if (!alias) {
            if (captcha) captcha.style.display = "none";
            return;
        }

        if (
            typeof W.showSessionInfo === "function" &&
            typeof W.configurationDataSet === "function"
        ) {
            W.showSessionInfo(W.configurationDataSet());
        } else if (captcha) {
            captcha.style.display = "block";
            document.dispatchEvent(
                new CustomEvent("vulcan:powcaptcha:reinit"),
            );
        }
    };

    const fixEduVulcanLoginPage = () => {
        const userName = document.querySelector("#UserName");
        const password = document.querySelector("#Password");
        userName?.setAttribute("autocomplete", "username");
        password?.setAttribute("autocomplete", "current-password");
        userName?.focus();

        const linksEl = document.querySelector(
            "#wizard1 > div > .flex-row:has(a)",
        );
        if (linksEl) document.querySelector("#wizard2")?.appendChild(linksEl);

        if (userName && !userName.dataset.ifvCaptchaSync) {
            userName.dataset.ifvCaptchaSync = "1";
            let timer;
            const schedule = () => {
                clearTimeout(timer);
                timer = setTimeout(syncEduVulcanLoginCaptcha, 700);
            };
            userName.addEventListener("input", schedule);
            userName.addEventListener("change", schedule);
            password?.addEventListener("focus", syncEduVulcanLoginCaptcha);
        }

        syncEduVulcanLoginCaptcha();
    };

    const fixLoginPage = () => {
        if (document.querySelector("#UserName")) {
            fixEduVulcanLoginPage();
            return;
        }

        setAutocomplete();
        document.querySelector("#btNext")?.remove();

        const wizard2 = document.querySelector("#wizard2");
        if (!wizard2) return;
        wizard2.parentElement.insertBefore(
            document.querySelector("#wizard1"),
            wizard2,
        );
        const centerBox = document.querySelector(".center-box");
        if (centerBox) centerBox.innerHTML = centerBox.innerHTML;
    };

    const isEduVulcanLoggedIn = () =>
        !!document.querySelector('a[href*="koniecPracy"]');

    const redirectToDziennik = () => {
        const path = W.location.pathname;

        if (
            path.replace(/\/+$/, "") === "/dostep-do-dziennika" &&
            isEduVulcanLoggedIn()
        ) {
            const journalLinks = [
                ...document.querySelectorAll('a[href*="/dziennik?"]'),
            ];
            if (journalLinks.length === 1) {
                W.location.assign(journalLinks[0].href);
            }
            return;
        }

        if (path === "/" && isEduVulcanLoggedIn()) {
            W.location.assign("/dostep-do-dziennika/");
        }
    };

    const toggleUserModal = () => {
        document.querySelector(".modal-background")?.classList.toggle("active");
        document.querySelector(".modal-user")?.classList.toggle("active");
    };

    const moveUserOptionsToHeader = async () => {
        const userLinks = await getFromAside(async () => {
            const user = document.querySelector(".user");
            if (user) {
                user.click();
                await waitForRender(() =>
                    document.querySelector(".user__links a"),
                );
                return document.querySelectorAll(".user__links a");
            }
        });
        const userData = await getUserData();

        const modalBackground = document.createElement("div");
        const modalElement = document.createElement("div");

        modalBackground.classList.add("modal-background");
        modalElement.classList.add("modal-user");

        const userDataElement = document.createElement("div");
        userDataElement.classList.add("modal-data");

        const userAvatar = document.createElement("div");
        userAvatar.innerHTML = `<span>${userData.fullName[0]}</span>`;
        userAvatar.classList.add("user-avatar");
        userDataElement.appendChild(userAvatar.cloneNode(true));

        const nameElement = document.createElement("div");
        nameElement.classList.add("modal-name");
        nameElement.innerHTML = `<span style="font-size: 20px">${userData?.fullName}</span><span style="font-size: 1rem;">${userData?.username}</span>`;
        userDataElement.appendChild(nameElement);
        modalElement.appendChild(userDataElement);

        userLinks.forEach((link, i) => {
            const linkContainer = document.createElement("div");
            linkContainer.classList.add("modal-link-container");

            const linkText = document.createElement("span");
            linkText.innerHTML = link.textContent;

            linkText.addEventListener("click", () => {
                executeActionOnAside(async () => {
                    document.querySelector(".user").click();
                    await waitForRender(() =>
                        document.querySelector(".user__links"),
                    );
                    document.querySelectorAll(".user__links a")[i].click();
                });
                toggleUserModal();
            });

            linkContainer.appendChild(linkText);
            modalElement.appendChild(linkContainer);
        });

        const backButtonContainer = document.createElement("div");
        backButtonContainer.classList.add("modal-back-container");
        const backButton = document.createElement("span");
        backButton.classList.add("modal-cancel");
        backButton.innerHTML = "Anuluj";
        backButtonContainer.appendChild(backButton);
        modalElement.appendChild(backButtonContainer);

        modalBackground.addEventListener("click", () => W.history.back());
        backButton.addEventListener("click", () => W.history.back());
        userAvatar.addEventListener("click", () => {
            toggleUserModal();
            W.history.pushState(
                { ...W.history.state, userModal: true },
                "",
                `${W.location.pathname}#user-modal`,
            );
        });

        document.body.appendChild(modalElement);
        document.body.appendChild(modalBackground);
        document
            .querySelector(".header_logo_tools_user-wrapper")
            .appendChild(userAvatar);

        W.addEventListener("popstate", () => {
            if (
                document
                    .querySelector(".modal-user")
                    ?.classList.contains("active")
            ) {
                toggleUserModal();
            }
        });
    };

    const isOpened = (element) =>
        element.querySelector(".MuiCollapse-root")?.style?.height !== "0px";

    const openAllTimetableDays = async () => {
        const container = document.querySelectorAll(
            ".app__content .MuiPaper-root",
        );
        for (const element of container) {
            if (!isOpened(element))
                element
                    .querySelector(".accordion__full-width__header h2")
                    ?.click();
            await waitForRender(() => isOpened(element), element);
        }
    };

    const mapData = () =>
        Array.from(
            document.querySelectorAll(".app__content .MuiPaper-root"),
        ).map((element) => ({
            note: element.querySelector(".plan-zajec__accordion__wolne")
                ?.innerText,
            day: element.querySelector(".MuiAccordionSummary-content > h2")
                ?.innerText,
            lessons: mapDay(element),
            element,
        }));

    const mapStartingHours = (data) => {
        const all = new Set();
        for (const day of data)
            if (day.lessons)
                for (const lesson of day.lessons)
                    if (lesson.startingHour) all.add(lesson.startingHour);
        const result = [...all].sort();
        const [firstHour, firstMinutes] = (result[0] || "08:00").split(":");
        return Number(firstHour) <= 7 && Number(firstMinutes) <= 30
            ? result
            : ["7:00", ...result];
    };

    const getStartingHours = () =>
        JSON.parse(localStorage.getItem("startingHours") || "[]");

    const renderTimetableDay = async (data) => {
        await openAllTimetableDays();

        if (!data.note) {
            await waitForRender(() =>
                document.querySelector(".details-btn--position-r-bottom"),
            );
        }

        const startingHours = getStartingHours();
        const lessons = mapDay(data.element);
        const element = document.createElement("section");
        element.classList.add("timetable");

        if (lessons.length < 1) {
            const infoElement = document.createElement("div");
            infoElement.innerHTML =
                "<div><span class='no-lessons-title'>Nie ma lekcji 😎</span><br><span></span></div>";
            if (data.note)
                infoElement.querySelector("span:last-of-type").innerText =
                    data.note;
            element.appendChild(infoElement);
        } else {
            for (const lesson of lessons) {
                const lessonElement = document.createElement("div");
                lessonElement.innerHTML = `
                    <div>${startingHours.findIndex((h) => h === lesson.startingHour)}</div>
                    <article>
                        <div class='info'><span></span><span></span></div>
                        <div class='data'></div>
                    </article>
                `;
                const lessonDataElement =
                    lessonElement.querySelector(".data");

                const timeContainer = lessonElement.querySelector(".info");
                timeContainer.firstElementChild.innerText = lesson.startingHour;
                timeContainer.lastElementChild.innerText = lesson.endingHour;

                lessonElement.classList.add("lesson");
                lessonElement.classList.add(lesson.type);

                if (lesson.type === "conflicted") {
                    lessonDataElement.innerHTML = `
                        <div class='subject'>Wpisana jest więcej niż jedna lekcja</div>
                        <div class='additional-info'>Kliknij, aby wyświetlić</div>
                    `;
                } else {
                    lessonDataElement.innerHTML = `<div class="subject"></div> <div class="additional-info"></div>`;
                    lessonDataElement.querySelector(".subject").innerText =
                        lesson.subject;
                    lessonDataElement.querySelector(
                        ".additional-info",
                    ).innerText = `${lesson.classroom} ${lesson.teacher?.split(" ")?.reverse()?.join(" ")}`;
                }

                lessonElement.addEventListener("click", () =>
                    lesson.originalElement.querySelector("button").click(),
                );
                element.appendChild(lessonElement);
            }
        }

        return element;
    };

    const runNewTimetable = async () => {
        document.querySelector(
            "section.app__content .app__content__header",
        ).style.display = "none";
        document.querySelector(
            "section.app__content .mobile__frame > div",
        ).style.display = "none";

        await openAllTimetableDays();
        localStorage.setItem(
            "startingHours",
            JSON.stringify(mapStartingHours(mapData())),
        );

        new SelectorRenderer(renderTimetableDay);
    };

    let attendanceTabsElement = null;

    const changeStatsVisibility = (isStatsVisible) => {
        const mainStats = document.querySelector(
            ".content-container:has(.statistics)",
        );
        mainStats.style.display = isStatsVisible ? "block" : "none";
        const element = document.querySelector(".tabsview");
        element.classList.add("attendance-init");
        if (isStatsVisible) element.classList.add("stats");
        else element.classList.remove("stats");
    };

    const buildAttendanceTabs = () => {
        if (attendanceTabsElement) return;
        const selector = document.createElement("div");
        if (window.innerWidth >= 1024)
            selector.innerHTML =
                '<button class="MuiButtonBase-root MuiButton-root MuiButton-contained default-button primary-button" disabled><span class="MuiButton-label">Frekwencja</span></button><button class="MuiButtonBase-root MuiButton-root MuiButton-contained default-button primary-button"><span class="MuiButton-label">Statystyki</span></button>';
        else
            selector.innerHTML =
                "<button disabled>Frekwencja</button><button><span>Statystyki</span></button><div></div><div></div>";
        selector.classList.add("attendance-tabs");

        selector
            .querySelector("button:first-of-type")
            .addEventListener("click", () => {
                changeStatsVisibility(false);
                selector.querySelector("button:first-of-type").disabled = true;
                selector.querySelector("button:last-of-type").disabled = false;
            });

        selector
            .querySelector("button:last-of-type")
            .addEventListener("click", () => {
                changeStatsVisibility(true);
                selector.querySelector("button:first-of-type").disabled = false;
                selector.querySelector("button:last-of-type").disabled = true;
            });

        attendanceTabsElement = selector;
    };

    const insertAttendanceTabs = () => {
        const container =
            window.innerWidth < 1024
                ? ".app__content > .mobile__frame"
                : ".app__content > .desktop__frame";
        document
            .querySelector(container)
            .insertBefore(
                attendanceTabsElement,
                document.querySelector(container + "> *"),
            );
        changeStatsVisibility(false);
    };

    const createJustifyButton = () => {
        const button = document.createElement("button");
        button.classList.add("justify-abstence");
        button.innerHTML = `<img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/excuse-attendance-button/assets/icons/stylus_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"> Usprawiedliw`;
        button.addEventListener("click", () => {
            document
                .querySelector(".app__content__header > .toolbar > button")
                .click();
        });
        document
            .querySelector(
                window.innerWidth < 1024
                    ? ".app__content > .mobile__frame"
                    : ".app__content > .desktop__frame",
            )
            .appendChild(button);
    };

    const dashboardIcons = [
        [
            "Dzisiejszy plan zajęć",
            "calendar_clock_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        [
            "Oceny od ostatniego logowania",
            "counter_6_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        ["Sprawdziany", "quiz_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        [
            "Zadania domowe",
            "summarize_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        ["Informacje", "folder_info_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        ["Ogłoszenia", "campaign_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        ["Ankiety", "feedback_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
        [
            "Frekwencja",
            "event_available_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        [
            "Dyżurni",
            "person_raised_hand_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg",
        ],
        ["Ważne dzisiaj", "strategy_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg"],
    ];

    const doesHaveClickableParent = (element) => {
        if (["a", "button"].includes(element.tagName.toLowerCase()))
            return true;
        if (!element.parentElement) return false;
        return doesHaveClickableParent(element.parentElement);
    };

    const applyDashboardIcons = () => {
        for (const [tileTitle, fileName] of dashboardIcons) {
            const icon = document.createElement("img");
            icon.src = `https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/${fileName}`;
            const container = Array.from(
                document.querySelectorAll(".content-container .tile.box"),
            )
                ?.find((e) => e.querySelector("h2").textContent === tileTitle)
                ?.querySelector(".tile__header.flex__items > .flex__item-auto");

            if (container) container.insertBefore(icon, container.firstChild);
            else {
                console.debug(`[IFV] Tile ${tileTitle} not found`);
                return;
            }

            container.parentElement?.parentElement?.addEventListener(
                "click",
                (e) => {
                    if (doesHaveClickableParent(e.target)) return;
                    container.parentElement
                        .querySelector("a.tile__link")
                        ?.click();
                },
            );
        }
    };

    let maxDashboardLessons = 0;

    const renderDashboardTimetable = () => {
        const timetableElement = document.querySelector(".plan-zajec");
        const timetable = mapDay(timetableElement);
        if (timetable.length < maxDashboardLessons) return;
        maxDashboardLessons = timetable.length;

        const elements = timetable.map((lesson) => {
            const element = document.createElement("li");
            if (lesson.type === "conflicted") {
                element.innerText = `Więcej pozycji`;
            } else {
                element.classList.add(lesson.type);
                element.innerText = `${lesson.subject} (${lesson.classroom}) ${
                    lesson.type === "unknown" ? lesson.annotationText : ""
                }`;
            }
            return element;
        });

        const container = document.createElement("ol");
        container.classList.add("lessons-container");
        container.append(...elements);

        const existingContainer =
            document.querySelector(".lessons-container");
        if (existingContainer) existingContainer.remove();

        timetableElement.parentElement.insertBefore(container, timetableElement);
    };

    const replaceDashboardTimetable = async () => {
        await waitForRender(() => document.querySelector(".plan-zajec"));
        renderDashboardTimetable();
        const observer = new MutationObserver(renderDashboardTimetable);
        observer.observe(document.querySelector(".plan-zajec"), {
            childList: true,
            subtree: true,
        });
    };

    const createDashboardToolbar = async () => {
        const getContainer = () =>
            document.querySelector(
                ".content-container > .tile-container > .tile-subcontainer",
            );
        await waitForRender(getContainer);

        const element = document.createElement("div");
        element.classList.add("dashboard-info-toolbar");
        element.innerHTML = `
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/star_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg">
                <span>-</span>
            </div>
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/event_note_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg">
                <span>-</span>
            </div>
            <div>
                <img src="https://raw.githubusercontent.com/banocean/ifv/refs/heads/main/assets/icons/mail_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg">
                <span>-</span>
            </div>`;

        const container = getContainer();
        container.insertBefore(element, container.firstChild);

        const getLuckyNumber = () =>
            document.querySelector(
                ".lucky-number__circle.lucky-number__number > span",
            )?.innerText;
        waitForRender(getLuckyNumber).then(
            () =>
                (element.querySelector(
                    "div:first-of-type > span",
                ).innerText = getLuckyNumber()),
        );

        const getAmountOfMessages = () =>
            document.querySelector(
                'a[title="Przejdź do modułu wiadomości"] .MuiBadge-anchorOriginTopRightRectangle',
            ).innerText;
        waitForRender(getAmountOfMessages).then(
            () =>
                (element.querySelector(
                    "div:last-of-type > span",
                ).innerText = getAmountOfMessages()),
        );
        element
            .querySelector("div:last-of-type")
            .addEventListener("click", () => {
                document
                    .querySelector('a[title="Przejdź do modułu wiadomości"]')
                    ?.click();
            });
    };

    const runNewDashboard = () => {
        applyDashboardIcons();
        createDashboardToolbar();
        replaceDashboardTimetable();
    };

    const fixGoingBack = () => {
        const mutationHandler = async (mutationList) => {
            for (const mutation of mutationList) {
                const modals = document.querySelectorAll(".MuiDrawer-modal");
                const modal = modals[modals.length - 1] || undefined;

                if (
                    modal &&
                    modal.getAttribute("data-has-listener") !== "true"
                ) {
                    W.history.pushState(
                        { ...W.history.state, details: true },
                        "",
                        `${W.location.pathname}#`,
                    );
                    modal.setAttribute("data-has-listener", "true");

                    for (const e of modals) {
                        if (e === modal) continue;
                        e.removeAttribute("data-has-listener");
                    }

                    await waitForRender(() =>
                        modal.querySelector(".modal-button--close"),
                    );
                    const closeButton = modal.querySelector(
                        ".modal-button--close",
                    );

                    const popstateHandler = () => {
                        if (
                            closeButton
                                ?.closest(
                                    "div[role=presentation].MuiDrawer-modal",
                                )
                                ?.getAttribute("data-has-listener") !== "true"
                        )
                            return;
                        closeButton?.click();
                    };

                    W.addEventListener("popstate", popstateHandler, {
                        once: true,
                    });

                    closeButton?.addEventListener("click", () => {
                        if (W.history.state?.details) W.history.back();
                    });
                }
            }
        };

        const observer = new MutationObserver(mutationHandler);
        observer.observe(document.body, { childList: true });
    };

    const modifyGradesRequests = () => {
        const XHR = W.XMLHttpRequest;
        const originalXHROpen = XHR.prototype.open;
        const originalXHRSend = XHR.prototype.send;

        XHR.prototype.open = function () {
            this._requestMethod = arguments[0];
            this._requestURL = arguments[1];
            return originalXHROpen.apply(this, arguments);
        };

        XHR.prototype.send = function () {
            const xhr = this;

            if (
                xhr._requestURL &&
                xhr._requestURL.includes("/api/Oceny?")
            ) {
                const originalOnReadyStateChange = xhr.onreadystatechange;

                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        try {
                            let data = JSON.parse(xhr.responseText);

                            if (
                                data &&
                                data.ocenyPrzedmioty &&
                                Array.isArray(data.ocenyPrzedmioty) &&
                                data.ustawienia &&
                                !data.ustawienia.isSredniaAndPunkty
                            ) {
                                data.ocenyPrzedmioty.forEach((subject) => {
                                    let sum = 0;
                                    let totalWeight = 0;

                                    if (
                                        subject.kolumnyOcenyCzastkowe &&
                                        Array.isArray(
                                            subject.kolumnyOcenyCzastkowe,
                                        )
                                    ) {
                                        subject.kolumnyOcenyCzastkowe.forEach(
                                            (column) => {
                                                if (
                                                    column.oceny &&
                                                    Array.isArray(
                                                        column.oceny,
                                                    )
                                                ) {
                                                    column.oceny.forEach(
                                                        (grade) => {
                                                            if (
                                                                grade.wpis &&
                                                                grade.wpis.match(
                                                                    /^[0-6](\+|\-)?$/,
                                                                )
                                                            ) {
                                                                let value =
                                                                    parseFloat(
                                                                        grade.wpis,
                                                                    );
                                                                if (
                                                                    grade.wpis.includes(
                                                                        "+",
                                                                    )
                                                                )
                                                                    value +=
                                                                        getSetting(
                                                                            "Count averages",
                                                                            "plusValue",
                                                                        );
                                                                else if (
                                                                    grade.wpis.includes(
                                                                        "-",
                                                                    )
                                                                )
                                                                    value -=
                                                                        getSetting(
                                                                            "Count averages",
                                                                            "minusValue",
                                                                        );

                                                                sum +=
                                                                    value *
                                                                    grade.waga;
                                                                totalWeight +=
                                                                    grade.waga;
                                                            }
                                                        },
                                                    );
                                                }
                                            },
                                        );
                                    }

                                    if (totalWeight > 0) {
                                        subject.srednia = (
                                            sum / totalWeight
                                        ).toFixed(2);
                                    }
                                });

                                if (data.ustawienia) {
                                    data.ustawienia.isSredniaAndPunkty = true;
                                }
                            }

                            Object.defineProperty(xhr, "responseText", {
                                get: function () {
                                    return data;
                                },
                            });
                            Object.defineProperty(xhr, "response", {
                                get: function () {
                                    return data;
                                },
                            });
                        } catch (e) {
                            console.debug("[IFV] Błąd modyfikacji odpowiedzi:", e);
                        }
                    }

                    if (typeof originalOnReadyStateChange === "function")
                        originalOnReadyStateChange.apply(this, arguments);
                };
            }

            return originalXHRSend.apply(this, arguments);
        };
    };

    const settingRenderers = {
        select: (setting, patchName, currentValue) => `
            <select class="setting-select" data-patch="${patchName}" data-setting="${setting.id}">
                ${setting.options
                    .map(
                        (option) => `
                    <option value="${option.value}" ${
                        option.value === currentValue ? "selected" : ""
                    }>${option.name}</option>
                `,
                    )
                    .join("")}
            </select>
        `,
        text: (setting, patchName, currentValue) => `
            <input type="text" class="setting-text" data-patch="${patchName}" data-setting="${setting.id}" value="${currentValue}" placeholder="${setting.default}">
        `,
        boolean: (setting, patchName, currentValue) => `
            <div class="setting-boolean">
                <div class="setting-boolean-toggle">
                    <input class="toggle-input" type="checkbox" data-patch="${patchName}" data-setting="${setting.id}" ${currentValue ? "checked" : ""}>
                    <div class="toggle-switch"></div>
                </div>
            </div>
        `,
        multiselect: (setting, patchName, currentValue) => {
            const selectedValues = Array.isArray(currentValue)
                ? currentValue
                : typeof currentValue === "string" && currentValue.length > 0
                  ? currentValue.split(",")
                  : [];
            return `
                <div class="setting-multiselect">
                    ${setting.options
                        .map(
                            (option) => `
                        <div class="checkbox-item">
                            <input type="checkbox" class="setting-multiselect-checkbox"
                                id="${patchName}-${setting.id}-${option.value}"
                                data-patch="${patchName}"
                                data-setting="${setting.id}"
                                value="${option.value}"
                                ${selectedValues.includes(option.value) ? "checked" : ""}>
                            <label for="${patchName}-${setting.id}-${option.value}">${option.name}</label>
                        </div>
                    `,
                        )
                        .join("")}
                </div>
            `;
        },
        color: (setting, patchName, currentValue) => `
            <input type="color" class="setting-color" data-patch="${patchName}" data-setting="${setting.id}" value="${currentValue}">
        `,
        number: (setting, patchName, currentValue) => `
            <input type="number" class="setting-number" data-patch="${patchName}" data-setting="${setting.id}" value="${currentValue}" step="${setting.step || 1}" placeholder="${setting.default}">
        `,
    };

    const removeMarks = (element) => {
        const marks = element.querySelectorAll("mark");
        marks.forEach((mark) => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
        });
        element.normalize();
    };

    const markTextInElement = (element, textQueryToHighlight) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodesToModify = [];

        let currentNode;
        while ((currentNode = walker.nextNode())) {
            const nodeText = currentNode.nodeValue;
            if (nodeText.toLowerCase().includes(textQueryToHighlight)) {
                nodesToModify.push({ node: currentNode, text: nodeText });
            }
        }

        nodesToModify.forEach(({ node, text }) => {
            const lowerText = text.toLowerCase();
            let matchIndex = lowerText.indexOf(textQueryToHighlight);
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            while (matchIndex !== -1) {
                fragment.appendChild(
                    document.createTextNode(text.substring(lastIndex, matchIndex)),
                );
                const mark = document.createElement("mark");
                mark.textContent = text.substring(
                    matchIndex,
                    matchIndex + textQueryToHighlight.length,
                );
                fragment.appendChild(mark);

                lastIndex = matchIndex + textQueryToHighlight.length;
                matchIndex = lowerText.indexOf(
                    textQueryToHighlight,
                    lastIndex,
                );
            }
            fragment.appendChild(
                document.createTextNode(text.substring(lastIndex)),
            );
            node.parentNode.replaceChild(fragment, node);
        });

        element.normalize();
    };

    const findPatch = (name) => PATCH_LIST.find((p) => p.name === name);

    const getSetting = (patchName, settingId) => {
        const patch = findPatch(patchName);
        if (!patch)
            throw new Error(`Patch with name ${patchName} not found.`);
        const setting = patch.settings?.find((s) => s.id === settingId);
        if (!setting)
            throw new Error(
                `Setting with id ${settingId} not found in patch ${patchName}.`,
            );

        const allSettings = loadPatchSettings();
        const savedValue = allSettings[patchName]?.[settingId];

        if (setting.type === "boolean") {
            if (savedValue !== undefined) return !!savedValue;
            return setting.default ?? false;
        }

        if (savedValue !== undefined) {
            if (setting.type === "multiselect" && typeof savedValue === "string")
                return savedValue.split(",");
            if (setting.type === "number" && typeof savedValue === "string")
                return parseFloat(savedValue);
            return savedValue;
        }

        if (setting.type === "multiselect") {
            if (Array.isArray(setting.default)) return setting.default;
            if (typeof setting.default === "string")
                return setting.default.split(",");
            return [];
        }

        return setting.default;
    };

    const saveSetting = (patchName, settingId, value) => {
        const patch = findPatch(patchName);
        if (!patch)
            throw new Error(`Patch with name ${patchName} not found.`);
        const setting = patch.settings?.find((s) => s.id === settingId);
        if (!setting)
            throw new Error(
                `Setting with id ${settingId} not found in patch ${patchName}.`,
            );

        const allSettings = loadPatchSettings();
        if (!allSettings[patchName]) allSettings[patchName] = {};
        allSettings[patchName][settingId] = value;
        savePatchSettings(allSettings);
    };

    const generateSettingsList = () => {
        const options = loadOptions();
        const patches = [...PATCH_LIST].sort((a, b) =>
            a.name.localeCompare(b.name, "pl"),
        );
        const root = document.createElement("div");
        root.className = "patches-list";

        root.innerHTML = `
            <div class="search-bar">
                <img src="${SEARCH_ICON}">
                <input placeholder="Search" type="text" autofocus />
                <button id="clear"><img src="${CLEAR_ICON}"></button>
            </div>
            <div class="category-bar">
                <select class="category-select">
                    <option value="all">Wszystkie</option>
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                </select>
                <button class="toggle-all-button" type="button">Wyłącz wszystko</button>
            </div>
            <div class="no-results-message">Nie znaleziono pasujących patchy 😿</div>
        `;

        for (const patch of patches) {
            const isEnabled = options[patch.name] !== false;

            const patchDiv = document.createElement("div");
            patchDiv.className = "patch";
            if (patch.devices === "mobileOnly")
                patchDiv.classList.add("mobileOnly");
            if (patch.devices === "desktopOnly")
                patchDiv.classList.add("desktopOnly");

            patchDiv.innerHTML = `
                <div class="patch-header">
                    <div class="patch-title-row">
                        <p class="patch-name">${patch.name}</p>
                        <div class="setting-boolean-toggle">
                            <input class="toggle-input patch-toggle" type="checkbox" data-patch="${patch.name}" ${isEnabled ? "checked" : ""}>
                            <div class="toggle-switch"></div>
                        </div>
                    </div>
                    <p class="patch-description">${patch.description}</p>
                </div>
                <div class="settings-list"></div>
            `;

            const settingsListDiv = patchDiv.querySelector(".settings-list");

            for (const setting of patch.settings || []) {
                const settingContainerDiv = document.createElement("div");
                settingContainerDiv.className = "setting";
                settingContainerDiv.innerHTML = `
                    <div class="setting-header">
                        <span class="setting-name">${setting.name}</span>
                        <span class="separator">—</span>
                        <span class="setting-description">${setting.description}</span>
                    </div>
                `;

                const settingInputDiv = document.createElement("div");
                settingInputDiv.className = "setting-input";

                const renderer = settingRenderers[setting.type];
                if (renderer) {
                    const currentValue = getSetting(patch.name, setting.id);
                    settingInputDiv.innerHTML = renderer(
                        setting,
                        patch.name,
                        currentValue,
                    );
                }

                settingContainerDiv.appendChild(settingInputDiv);
                settingsListDiv.appendChild(settingContainerDiv);
            }

            if (!patch.settings?.length)
                settingsListDiv.style.display = "none";

            root.appendChild(patchDiv);
        }

        setupSettingsSearch(root);
        addSettingsInputListeners(root);
        addSettingsButtons(root, patches, options);

        return root;
    };

    const setupSettingsSearch = (root) => {
        const searchInput = root.querySelector(".search-bar > input");
        const categorySelect = root.querySelector(".category-select");
        const noResultsMessage = root.querySelector(".no-results-message");

        const applyFilters = () => {
            const query = searchInput.value.trim().toLowerCase();
            const category = categorySelect.value;
            let visiblePatchesCount = 0;

            root.querySelectorAll(".patch").forEach((patchDiv) => {
                if (
                    category === "mobile" &&
                    patchDiv.classList.contains("desktopOnly")
                ) {
                    patchDiv.style.display = "none";
                    return;
                }
                if (
                    category === "desktop" &&
                    patchDiv.classList.contains("mobileOnly")
                ) {
                    patchDiv.style.display = "none";
                    return;
                }

                const patchNameEl = patchDiv.querySelector(".patch-name");
                const patchDescEl = patchDiv.querySelector(".patch-description");

                removeMarks(patchNameEl);
                removeMarks(patchDescEl);
                patchDiv.querySelectorAll(".setting").forEach((settingDiv) => {
                    removeMarks(settingDiv.querySelector(".setting-name"));
                    removeMarks(settingDiv.querySelector(".setting-description"));
                });

                if (query === "") {
                    patchDiv.style.display = "block";
                    visiblePatchesCount++;
                    return;
                }

                let combinedTextContent =
                    patchNameEl.textContent.toLowerCase() +
                    " " +
                    patchDescEl.textContent.toLowerCase() +
                    " ";

                patchDiv.querySelectorAll(".setting").forEach((settingDiv) => {
                    combinedTextContent +=
                        settingDiv
                            .querySelector(".setting-name")
                            .textContent.toLowerCase() + " ";
                    combinedTextContent +=
                        settingDiv
                            .querySelector(".setting-description")
                            .textContent.toLowerCase() + " ";
                });

                if (combinedTextContent.includes(query)) {
                    patchDiv.style.display = "block";
                    visiblePatchesCount++;

                    markTextInElement(patchNameEl, query);
                    markTextInElement(patchDescEl, query);

                    patchDiv.querySelectorAll(".setting").forEach((settingDiv) => {
                        markTextInElement(
                            settingDiv.querySelector(".setting-name"),
                            query,
                        );
                        markTextInElement(
                            settingDiv.querySelector(".setting-description"),
                            query,
                        );
                    });
                } else {
                    patchDiv.style.display = "none";
                }
            });

            if (query === "") noResultsMessage.style.display = "none";
            else if (visiblePatchesCount === 0)
                noResultsMessage.style.display = "block";
            else noResultsMessage.style.display = "none";
        };

        searchInput.addEventListener("input", applyFilters);
        categorySelect.addEventListener("change", applyFilters);

        root.querySelector("#clear").addEventListener("click", () => {
            searchInput.value = "";
            searchInput.dispatchEvent(new Event("input"));
        });
    };

    const addSettingsInputListeners = (root) => {
        root.querySelectorAll(".setting-boolean-toggle").forEach((toggle) => {
            toggle.querySelector(".toggle-switch").addEventListener("click", () => {
                const input = toggle.querySelector(".toggle-input");
                input.checked = !input.checked;
                if (input.classList.contains("patch-toggle")) {
                    const options = loadOptions();
                    options[input.dataset.patch] = input.checked;
                    saveOptions(options);
                } else {
                    saveSetting(
                        input.dataset.patch,
                        input.dataset.setting,
                        input.checked,
                    );
                }
            });
        });

        root.querySelectorAll(
            ".setting-select, .setting-text, .setting-color, .setting-number",
        ).forEach((input) => {
            input.addEventListener("change", () => {
                saveSetting(input.dataset.patch, input.dataset.setting, input.value);
            });
        });

        root.querySelectorAll(".setting-multiselect-checkbox").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const patchName = checkbox.dataset.patch;
                const settingId = checkbox.dataset.setting;
                const selectedValues = Array.from(
                    root.querySelectorAll(
                        `.setting-multiselect-checkbox[data-patch='${patchName}'][data-setting='${settingId}']:checked`,
                    ),
                ).map((cb) => cb.value);
                saveSetting(patchName, settingId, selectedValues);
            });
        });
    };

    const addSettingsButtons = (root, patches, options) => {
        const buttonsDiv = document.createElement("div");
        buttonsDiv.className = "buttons";
        buttonsDiv.innerHTML = `
            <button class="reset-button" title="spowoduje odświeżenie strony">Zresetuj do domyślnych</button>
            <button class="apply-button" title="spowoduje odświeżenie strony">Zastosuj ustawienia</button>
        `;
        root.appendChild(buttonsDiv);

        root.querySelector(".apply-button").addEventListener("click", () =>
            W.location.reload(),
        );

        root.querySelector(".reset-button").addEventListener("click", () => {
            for (const patch of patches) {
                for (const setting of patch.settings || []) {
                    saveSetting(patch.name, setting.id, setting.default);
                }
            }
            W.location.reload();
        });

        const toggleAllButton = root.querySelector(".toggle-all-button");
        const allEnabled = patches.every((p) => options[p.name] !== false);
        toggleAllButton.innerText = allEnabled
            ? "Wyłącz wszystko"
            : "Włącz wszystko";

        toggleAllButton.addEventListener("click", () => {
            const freshOptions = loadOptions();
            const currentAllEnabled = patches.every(
                (p) => freshOptions[p.name] !== false,
            );
            for (const patch of patches)
                freshOptions[patch.name] = !currentAllEnabled;
            saveOptions(freshOptions);
            W.location.reload();
        });
    };

    const openStandaloneSettings = () => {
        if (document.querySelector(".ifv-standalone-settings")) return;

        const background = document.createElement("div");
        const modal = document.createElement("div");
        background.className =
            "ifv-patches-modal-background ifv-standalone-settings";
        modal.className = "ifv-patches-modal ifv-standalone-settings";
        modal.innerHTML = `
            <div class="ifv-patches-modal-header">
                <img src="${currentHost().includes("eduvulcan") ? LOGO_BLUE : LOGO_RED}" class="ifv-logo">
                <h1>Ustawienia ifv</h1>
                <button id="ifv-close-standalone"><img src="${CLOSE_ICON}"></button>
            </div>
        `;
        modal.appendChild(generateSettingsList());

        const close = () => {
            background.remove();
            modal.remove();
            document.body.style.overflow = "auto";
        };

        background.addEventListener("click", close);
        modal
            .querySelector("#ifv-close-standalone")
            .addEventListener("click", close);

        document.body.appendChild(background);
        document.body.appendChild(modal);
        document.body.style.overflow = "hidden";

        requestAnimationFrame(() => {
            modal.style.transform = "translate(-50%, -50%)";
            modal.style.opacity = "1";
            modal.style.zIndex = "2147483000";
            background.style.background = "rgba(0, 0, 0, 0.5)";
            background.style.zIndex = "2147482999";
        });
    };

    const addDesktopSettings = () => {
        const settingsButton = document.createElement("button");
        settingsButton.innerHTML = `<img src="${SETTINGS_ICON}" style="width: 40px; height: 40px; filter: invert(1);">`;
        settingsButton.classList.add("ifv-settings-button");
        settingsButton.setAttribute("title", "Ustawienia ifv");

        const modalDiv = document.createElement("div");
        const modalBackground = document.createElement("div");
        modalDiv.className = "ifv-patches-modal";
        modalBackground.className = "ifv-patches-modal-background";
        modalDiv.innerHTML = `
            <div class="ifv-patches-modal-header">
                <img src="${currentHost().includes("eduvulcan") ? LOGO_BLUE : LOGO_RED}" class="ifv-logo">
                <h1>Ustawienia ifv</h1>
                <button id="ifv-close-patches-modal"><img src="${CLOSE_ICON}"></button>
            </div>
        `;

        const hideModal = () => {
            modalDiv.style.transform = "translate(-50%, 200%)";
            modalDiv.style.opacity = "0.3";
            modalBackground.style.background = "rgba(0, 0, 0, 0)";
            document.body.style.overflow = "auto";
            setTimeout(() => {
                modalDiv.style.zIndex = "-1";
                modalBackground.style.zIndex = "-1";
                modalDiv.scroll(0, 0);
            }, 300);
        };

        const showModal = () => {
            modalDiv.style.transform = "translate(-50%, -50%)";
            modalDiv.style.zIndex = "1000";
            modalDiv.style.opacity = "1";
            modalBackground.style.background = "rgba(0, 0, 0, 0.5)";
            modalBackground.style.zIndex = "999";
            document.body.style.overflow = "hidden";
        };

        settingsButton.addEventListener("click", showModal);
        modalDiv
            .querySelector("#ifv-close-patches-modal")
            .addEventListener("click", hideModal);
        modalBackground.addEventListener("click", hideModal);

        modalDiv.appendChild(generateSettingsList());
        document.body.appendChild(modalBackground);
        document.body.appendChild(modalDiv);
        document
            .querySelector(".app__aside__desktop + .app__main .header__tools")
            .appendChild(settingsButton);
    };

    const addMobileSettings = () => {
        const settingsButton = document.createElement("div");
        settingsButton.innerHTML = `<div class="icon" style="content: url(&quot;${SETTINGS_ICON}&quot;);"></div><span class="name">Ustawienia ifv</span>`;
        settingsButton.addEventListener("click", () => {
            const settingsModal = document.createElement("div");
            settingsModal.classList.add("settings-popup", "list-modal");
            settingsModal.innerHTML = `<div><img src='${BACK_ICON}'><h1>Ustawienia IFV</h1></div><div></div>`;
            settingsModal.querySelector("img").addEventListener("click", () => {
                settingsModal.remove();
            });
            const settingsList = generateSettingsList();
            settingsModal
                .querySelector("div:last-of-type")
                .appendChild(settingsList);
            settingsModal
                .querySelector("div:last-of-type")
                .classList.add("ifv-patches-mobile");
            document.body.appendChild(settingsModal);
        });

        waitForRender(
            () => document.querySelectorAll(".more-popup.list-modal div")[1],
        ).then(() => {
            document
                .querySelectorAll(".more-popup.list-modal div")[1]
                .appendChild(settingsButton);
        });
    };

    const CSS = {
        "moveTitleToHeader/style.css": `
.header__logo-product > a > svg,
.header__logo-product > img {
    display: none;
}

.header__logo-product {
    font-family:
        WorkSans,
        Graphik,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Helvetica,
        Arial,
        sans-serif,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol";
    margin-left: 16px !important;
}

.header__logo-product > span {
    font-size: 24px;
    text-wrap: nowrap;
    max-width: calc(100vw - 128px - 16px);
    text-overflow: ellipsis !important;
    white-space: nowrap;
    overflow: hidden;
}

.app__content__header {
    display: none;
}

.go_to_dashboard {
    font-family:
        WorkSans,
        Graphik,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Helvetica,
        Arial,
        sans-serif,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol";
    font-size: 24px;
    color: #3d4455;
    position: fixed;
    top: 50px;
    left: 16px;
    z-index: 6942000;
    background-color: white;
    padding: 4px;
    border-radius: 0 0 10px 10px;
    border-color: #e5e7e9;
    border-style: solid;
    border-width: 0 2px 2px 2px;
}

@media screen and (max-width: 1023px) {
    header.app__header {
        border-width: 0 !important;
        box-shadow: none !important;
    }
}

.go_to_dashboard > img {
    rotate: 180deg;
    height: 24px;
    width: 24px;
    opacity: 70%;
    transform: translateY(-3px);
}

.hidden {
    display: none;
}
`,
        "arrows.css": `
@media screen and (max-width: 1023px) {
    .modal__header {
        font-family:
            "WorkSans",
            Graphik,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Helvetica,
            Arial,
            sans-serif,
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol" !important;
        background: white !important;
        border-bottom: 2px solid #e5e7e9 !important;
        min-height: 60px !important;
        color: black !important;
    }

    .modal__title {
        padding: 17.5px 48px !important;
    }

    .modal-button--close {
        background-color: white !important;
        box-shadow: none !important;
        position: absolute !important;
        top: calc((60px - 40px) / 2) !important;
        cursor: pointer;
        padding: 0 !important;
        margin: 0 0 0 10px !important;
        border: none !important;
        width: 40px !important;
        height: 40px !important;
    }

    .modal-button--close > span:first-of-type {
        display: none !important;
    }

    .modal-button--close > span:last-of-type {
        content: url("https://raw.githubusercontent.com/banocean/ifv/main/assets/icons/keyboard_backspace_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg");
        filter: invert(0.8);
        height: 40px;
    }

    .modal-button--close > span > svg {
        display: none !important;
    }
}
`,
        "hideSubjectsWithNoGrades/normalGrades.css": `
article.grades__box:has(.tile__content:first-of-type:empty) {
    display: none !important;
}
tbody.p-datatable-tbody > tr:has(.wider--oceny:empty) {
    display: none !important;
}
.grades__box > .tile__content:empty {
    display: none !important;
}
.grades__box > .tile__content:has(~ .tile__content:empty) {
    border-bottom: 0 !important;
}
.mobile__frame .grades__box .info-label {
    min-width: 100% !important;
}
.content-container .grades__box .info-row {
    padding-top: 5px;
    padding-bottom: 5px;
    margin-bottom: 0;
    margin-inline: auto;
}
.content-container .grades__box .tile__content {
    padding: 5px 20px;
}
.p-datatable-wrapper table .p-datatable-thead th.wider--oceny, .p-datatable-wrapper table .p-datatable-tbody td.wider--oceny {
    width: auto;
}
`,
        "hideEmptyExamResults.css": `
.accordion__full-width__one-item:has(#panel-content-egzaminy td[colspan="3"]) {
    display: none !important;
}

main .app__content:has(.accordion__full-width__one-item #panel-content-egzaminy td[colspan="3"]) .content-container.content-container__pure > div:nth-child(2) {
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
}
`,
        "hideFooter.css": `
@media screen and (max-width: 1023px) {
    .app__footer__container {
        display: none;
    }
}
`,
        "hideWCAG.css": `
.wcag-mobile, .wcag-tools, .wcag-controls, #wcag-tools {
    display: none !important;
}
`,
        "alignDetailedGradesButton.css": `
.grades__subject {
    justify-content: space-between;
}
`,
        "hideTutorsFromBoard.css": `
.tile:has(.tile__content .tile__teachers) {
    display: none !important;
}
`,
        "cleanUpEduVulcanHome.css": `
.box-app, .carousel-area, .ribbon-bg {
    display: none !important;
}

.part-business-content-bottom {
    padding-left: 0 !important;
}

.main-content {
    flex-direction: column;
    flex: inherit !important;
}

.part-constant, .part-business {
    flex: 0 !important;
    padding: 0 !important;
}

.part-business { display: none; }

.header-part-2 {
    min-width: inherit !important;
}
`,
        "hideHelpOnDashboard.css": `
#kafel-pomoc-pomigracyjna {
  display: none !important;
}
`,
        "hideWeekends.css": `
.plan-scheduler__body-cell:nth-of-type(6),
.plan-scheduler__body-cell:nth-of-type(7),
.plan-scheduler__header-cell:nth-of-type(6),
.plan-scheduler__header-cell:nth-of-type(7),
.scheduler-simple__header-cell:nth-of-type(6),
.scheduler-simple__header-cell:nth-of-type(7),
.scheduler-simple__body-cell:nth-of-type(6),
.scheduler-simple__body-cell:nth-of-type(7),
.scheduler__body-cell:nth-of-type(6),
.scheduler__body-cell:nth-of-type(7),
.scheduler__header-cell:nth-of-type(6),
.scheduler__header-cell:nth-of-type(7),
.frequency-scheduler__body-cell:nth-of-type(6),
.frequency-scheduler__body-cell:nth-of-type(7),
.frequency-scheduler__header-cell:nth-of-type(6),
.frequency-scheduler__header-cell:nth-of-type(7) {
    display: none !important;
}

.plan-scheduler-cell__unavailable > div,
.scheduler-simple-cell--disabled > div,
.frequency-scheduler-cell--unavailable > div {
    min-height: 0 !important;
    padding: 0 !important;
}

.plan-scheduler-cell__unavailable,
.scheduler-simple-cell--disabled,
.frequency-scheduler-cell--unavailable {
    padding: 0 !important;
    margin: 0 !important;
}
`,
        "highlightToday.css": `
.scheduler-simple-cell--current, .scheduler-cell--current, .frequency-scheduler-cell--current, .plan-scheduler-cell__current {
    background-color: rgba(200, 200, 210, 0.25);
}
.scheduler-simple-cell--current .scheduler-simple-cell__number, .scheduler-cell--current .scheduler-cell__number, .frequency-scheduler-cell--current .frequency-scheduler-cell__footer, .plan-scheduler-cell__current .plan-scheduler-cell__footer-day {
    background-color: #e12d39;
    color: #ffffff !important;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 43px;
    height: 43px;
    border-radius: 50px;
}
.scheduler-simple-cell--current .scheduler-simple-cell__number {
    width: 30px;
    height: 30px;
}
`,
        "redirectToBoard/styles.css": `
.app.hideAside aside {
    display: none;
}
`,
        "loginPasswordTogether/styles.css": `
#wizard1 {
    order: 2;
    display: block !important;
}

.form-focused-subtitle,
.form-subtitle,
#wizard1 > .flex-col.form-gap.form-margin,
#wizard1 > .flex-col.gap-3.my-2 {
    display: none !important;
}

#wizard2 {
    order: 3;
    display: block !important;
}

#btPrev {
    display: none;
}
`,
        "newMobileNavbar/styles.css": `
:root {
    --bottom-navbar-height: 70px;
}

.list-modal {
    height: 100svh;
    width: 100%;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 4000;
    background: #eff2f7;
    font-family: "WorkSans", Graphik, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}

.list-modal > div:first-of-type {
    background: white;
    border-bottom: 2px solid #e5e7e9;
    height: 60px;
    display: flex;
    align-items: center;
}

.list-modal > div:first-of-type > img {
    margin-left: 10px;
    position: absolute;
    filter: invert(0.8);
    top: calc((60px - 40px) / 2);
    cursor: pointer;
    height: 40px;
}

.list-modal > div:first-of-type > h1 {
    width: 100%;
    font-size: 1.8rem;
    text-align: center;
}

.list-modal > div:last-of-type {
    overflow-y: auto;
    height: calc(100svh - 60px - var(--bottom-navbar-height));
}

.list-modal > div:last-of-type > div {
    display: flex;
    color: black;
    font-size: 1.6rem;
    cursor: pointer;
    padding-inline: 15px;
    padding-block: 10px;
    fill: black;
    border-bottom: 1px solid #e5e7e9;
    align-items: center;
}

.list-modal > div:last-of-type > div > .icon {
    filter: invert(0.8);
    margin-right: 20px;
}

.list-modal > div:last-of-type > div > .name {
    display: flex;
    align-content: center;
}

@media screen and (max-width: 1023px) {
    .modal {
        width: 100vw !important;
        height: calc(100svh - var(--bottom-navbar-height)) !important;
    }

    .modal__footer {
        background: none !important;
        border-top: 0 !important
    }

    aside, .header__hamburger__icon {
        display: none !important;
    }

    .app__aside__mobile + .app__main {
        display: block !important;
    }

    div#root {
        overflow: auto;
        height: calc(100svh - 60px - var(--bottom-navbar-height));
        top: 60px;
        position: fixed;
    }

    header.app__header {
        position: fixed;
        width: 100%;
        top: 0;
    }

    .bottom-navigation-bar {
        border-top: 2px solid #e5e7e9;
        background: white;
        display: flex;
        justify-content: space-around;
        position: fixed;
        top: calc(100svh - var(--bottom-navbar-height));
        height: var(--bottom-navbar-height);
        width: 100%;
        align-items: center;
        z-index: 4002;
    }

    .bottom-navigation-bar > div {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .bottom-navigation-bar > div > div:has(img) {
        padding-inline: 15px;
        padding-block: 4px;
        margin-bottom: 4px;
        border-radius: 20px;
        width: min-content;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 40px;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 300ms;
    }

    .bottom-navigation-bar > div > div > img {
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 300ms;
        height: 25px;
        margin: 2px;
    }

    .bottom-navigation-bar > div > div:has(img.highlight) {
        font-family: "WorkSans", Graphik, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        background: var(--kolor-wcag);
    }

    .bottom-navigation-bar > div > div > img:not(.highlight) {
        filter: invert(1);
    }
}

main.app__main {
    width: 100vw !important;
}

#root {
    display: flex;
    flex-direction: column;
}

.app__mobile {
    flex: 1;
    min-height: 100%;
}
`,
        "apis/bottomDateSelector/styles.css": `
.date-selector > div {
    height: 40px;
    position: fixed;
    margin-bottom: var(--bottom-navbar-height);
    bottom: 0;
    width: 100vw;
    left: 0;
    display: flex;
    justify-content: space-between;
    background: var(--background-navigation);
    border-top: 2px solid #e5e7e9;
    z-index: 100;
    align-items: center;
}

.date-selector > input {
    display: none;
}

div#root:has(.date-selector) {
    height: calc(100svh - 60px - var(--bottom-navbar-height) - 40px);
}

.date-selector > div > img {
    filter: invert(0.8);
    height: 35px;
    cursor: pointer;
}

.date-selector > div > span {
    font-size: 15px;
    cursor: pointer;
}

body:has(.date-selector):not(:has(.modal)) .bottom-navigation-bar {
    border-top: 0 !important;
}
`,
        "newTimetable/styles.css": `
:root {
    --background-primary: light-dark(white, #0b1517);
    --background-navigation: light-dark(white, #152528);
}

body {
    color-scheme: only light;
}

.app__main {
    background: var(--background-primary) !important;
    height: auto;
}

.timetable {
    padding: 0 !important;
    margin-inline: 10px !important;
}

.timetable:not(:has(.lesson)) {
    display: flex;
    justify-content: center;
    align-items: center;
    height: calc(100svh - 62px - 40px - 20px - var(--bottom-navbar-height));
    text-align: center;
}

.timetable .no-lessons-title {
    font-size: 24px;
}

.timetable .lesson {
    display: flex;
    margin-bottom: 5px;
    line-height: 16px;
}

.lesson > div:first-of-type {
    font-size: 30px;
    display: flex;
    align-items: center;
    color: light-dark(#1b1b1f, #f5feff);
    min-width: 18px;
}

.lesson > article {
    display: flex;
    padding: 15px;
    align-content: center;
    border-radius: 10px;
    width: 100%;
    margin-left: 10px;
    cursor: pointer;
    background: light-dark(#efedf1, #192123);
    overflow: hidden;
}

.lesson .subject {
    color: light-dark(#1b1b1f, #dbe4e7);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-wrap: nowrap !important;
}

.lesson .data {
    overflow: inherit;
}

.lesson .info {
    display: flex;
    flex-direction: column;
    margin-right: 10px;
    color: #a1aaac;
}

.lesson .additional-info {
    color: #a1aaac;
    font-size: smaller;
}

.lesson.canceled > article {
    background: light-dark(#f9dedc, #8c1d18);
}

.lesson.canceled .subject {
    text-decoration: line-through;
    color: light-dark(#410e0b, #f9dedc);
}

.lesson.canceled .info,
.lesson.canceled .additional-info {
    color: light-dark(#784c4a, #d9a5a1);
}

.lesson.canceled > div:first-of-type {
    color: light-dark(#b3261e, #f2b8b5);
}

.lesson.substitute > article {
    background: light-dark(#e7e4bd, #65683c);
}

.lesson.substitute .info,
.lesson.substitute .additional-info {
    color: light-dark(#58574e, #b8bfb4);
}

.lesson.substitute > div:first-of-type {
    color: light-dark(#6d5e0f, #65683c);
}
`,
        "newAttendance/style.css": `
.justify-abstence {
    padding-inline: 15px;
    border-radius: 15px;
    border: 0;
    position: fixed;
    z-index: 100;
    color: white;
    background: #314578;
    font-weight: 500;
    font-family:
        "WorkSans",
        Graphik,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Helvetica,
        Arial,
        sans-serif,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol";
    padding-block: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    bottom: 80px;
    right: 10px;
    cursor: pointer;
    font-size: 16px;
}

.justify-abstence > img {
    margin-right: 10px;
}

.content__header > .toolbar {
    display: none;
}

.frequency__legend {
    display: none !important;
}

@media screen and (min-width: 1024px) {
    .attendance-tabs > button:first-of-type {
        margin-right: 10px;
    }

    .attendance-tabs > button:disabled {
        opacity: 50%;
    }
}

.tabsview.stats > div:first-of-type {
    display: none !important;
}

.tabsview.stats > .tabsview__tabs > div > div > div:not(:last-of-type) {
    display: none;
}

.tabsview.attendance-init:not(.stats)
    > .tabsview__tabs
    > div
    > div
    > div:last-of-type {
    display: none;
}

.tabsview.attendance-init > div:first-of-type {
    margin-top: 10px;
}

@media screen and (max-width: 1023px) {
    .app__content:has(.attendance-tabs) {
        margin-top: 0;
        padding-top: 0;
    }

    .attendance-tabs {
        position: fixed;
        background: white;
        top: 60px;
        z-index: 100;
        transform: translateX(-5px);
        width: 100vw;
    }

    .attendance-tabs > button {
        width: 50%;
        color: var(--kolor-brand);
        font-weight: 600;
        padding: 0;
        margin: 0;
        background: none;
        height: 40px;
        border: 0;
        cursor: pointer;
    }

    .attendance-tabs > div:not(:last-of-type) {
        width: 40vw;
        margin-left: 5vw;
        height: 3px;
        background: var(--kolor-brand);
        border-radius: 3px;
        transition: 100ms all ease-in-out;
        position: relative;
        z-index: 101;
        top: 1px;
    }

    .attendance-tabs:has(button:first-of-type:not(:disabled))
        > div:not(:last-of-type) {
        transform: translateX(50vw);
    }

    .attendance-tabs > div:last-of-type {
        position: relative;
        width: 100vw;
        border-bottom: 2px solid #e5e7e9;
        cursor: pointer;
    }

    div#root:has(.attendance-tabs) {
        height: calc(
            100svh - 60px - 44px - var(--bottom-navbar-height)
        ) !important;
        top: 104px;
    }
}
`,
        "newDashboard/styles.css": `
@media screen and (max-width: 1023px) {
    .content-container:has(.plan-zajec) {
        margin: 0 !important;
    }

    .content-container:has(.plan-zajec),
    .content-container:has(.plan-zajec) > .tile-container {
        padding: 0 !important;
        background: none !important;
        box-shadow: none !important;
    }

    .box-shaded {
        background-color: #f8f9fc !important;
        box-shadow: none !important;
        border-width: 0 !important;
    }

    .tile__header h2 {
        font-weight: bold;
    }

    .tile__header .toolbar {
        display: none;
    }

    .tile__header.flex__items > .flex__item-auto {
        display: flex;
        align-items: center;
    }

    .tile__header.flex__items > .flex__item-auto > img {
        filter: invert(0.8);
        margin-right: 5px;
    }

    .content-container .tile .tile__header {
        padding-top: 10px;
        padding-left: 10px;
        border-bottom: 0;
        padding-bottom: 0;
    }

    .tile.box.tile__lucky-number,
    .tile.box:has(.lucky-number__circle.lucky-number__circle-1),
    .tile.box:has(.tile__lucky-number) {
        display: none !important;
    }

    .dashboard-info-toolbar {
        display: flex;
        height: 50px;
        gap: 10px;
    }

    .dashboard-info-toolbar > div {
        padding: 10px;
        background: #f8f9fc;
        border-radius: 10px;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
    }

    .dashboard-info-toolbar > div > img {
        filter: invert(0.8);
        margin-right: 5px;
        height: 28px;
    }

    .dashboard-info-toolbar > div > span {
        margin-right: 5px;
    }

    .content-container > .tile-container,
    .content-container > .tile-container > .tile-subcontainer {
        gap: 10px !important;
    }

    body:has(.dashboard-info-toolbar) .plan-zajec,
    body:has(.dashboard-info-toolbar)
        .tile__content:has(.plan-zajec)
        > .tile__content__title {
        display: none !important;
    }

    .lessons-container {
        margin-left: 15px;
        font-family:
            "WorkSans",
            Graphik,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Helvetica,
            Arial,
            sans-serif,
            "Apple Color Emoji",
            "Segoe UI Emoji",
            "Segoe UI Symbol";
        font-size: 14px;
        text-wrap: wrap;
    }

    .lessons-container .canceled {
        color: #e12d39 !important;
        text-decoration: line-through !important;
    }

    .lessons-container .substitute {
        color: #6d5e0f !important;
    }
}
`,
        "moveUserOptionsToHeader/styles.css": `
@media screen and (max-width: 1023px) {
    .user__section,
    div:has(.user__links__conatainer) {
        display: none !important;
    }

    .app.hideAside aside {
        display: none !important;
    }

    .header_logo_tools_user-wrapper img {
        width: 45px;
        height: 45px;
        margin-right: 10px;
        cursor: pointer;
    }

    .modal-background {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9999;
    }

    .modal-background.active {
        display: block !important;
    }

    .modal-user {
        display: none;
        top: 50%;
        left: 50%;
        position: absolute;
        overflow: hidden;
        transform: translate(-50%, -50%);
        width: 80vw;
        max-width: 400px;
        height: min-content !important;
        max-height: min-content !important;
        border-radius: 10px;
        background-color: #fff;
        z-index: 10000;
        padding: 10px;
    }

    .modal-user.active {
        display: block !important;
    }

    .modal-data {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 20px;
        margin-bottom: 10px;
    }

    .modal-name {
        display: flex;
        flex-direction: column;
        padding-left: 0;
        gap: 5px;
    }

    .modal-name > span {
        font-size: 20px;
        overflow: hidden;
        width: calc(80vw - 116px);
        text-wrap: nowrap;
        text-overflow: ellipsis;
    }

    .modal-link-container,
    .modal-back-container {
        display: flex;
        align-items: center;
        padding: 10px 20px;
        cursor: pointer;
    }

    .modal-back-container {
        justify-content: flex-end;
    }

    .modal-link-container span {
        padding: 0;
        font-size: 1.2rem;
        font-weight: 500;
        text-decoration: none;
        color: #3d4455;
    }

    .modal-cancel {
        text-align: right;
        color: #e33f4a;
        font-size: 1.2rem;
        font-weight: 500;
        cursor: pointer;
    }

    .header__logo-product > img {
        width: auto !important;
    }

    header.app__header {
        height: 60px;
    }

    body.blue .user-avatar {
        background: #38817f !important;
        color: #ffffff;
    }

    .user-avatar {
        background: #f8d6d8;
        height: 40px;
        min-width: 40px;
        border-radius: 50%;
        margin-right: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        font-size: 1.8rem;
    }
}
`,
        "patchesSettings/style.css": `
.ifv-settings-button {
    background: none;
    border: none;
    cursor: pointer;
    padding-right: 10px;
}

.ifv-patches-modal {
    background: #f9f9ff;
    color: #202022;
    border-radius: 15px;
    padding: 20px;
    width: 800px;
    max-height: 70%;
    overflow-y: auto;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, 200%);
    opacity: 0.3;
    z-index: -1;
    transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1),
        opacity 0.3s ease-in-out;
    box-shadow: 0 8px 10px -5px rgba(0, 0, 0, 0.2),
        0 16px 24px 2px rgba(0, 0, 0, 0.14), 0 6px 30px 5px rgba(0, 0, 0, 0.12);
}

.search-bar {
    display: flex;
    align-items: center;
    background-color: #ecedf7;
    padding: 0 12px;
    border-radius: 20px;
    margin-bottom: 15px;
    height: 40px;
    box-sizing: border-box;
    border: 1px solid #ecedf7;
    transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.search-bar:has(input[type="text"]:focus) {
    border-color: #007bff;
    box-shadow: 0 0 0 2px #007bff40;
}

.search-bar img {
    margin-right: 8px;
    flex-shrink: 0;
}

.search-bar input[type="text"] {
    flex-grow: 1;
    border: none;
    outline: none;
    background-color: transparent;
    font-size: 14px;
    color: #202022;
    height: 100%;
    padding: 0;
    box-sizing: border-box;
}

.search-bar input[type="text"]::placeholder {
    color: #8e8e8e;
}

.search-bar button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex-shrink: 0;
}

.search-bar button img {
    margin-right: 0;
}

.ifv-patches-modal mark,
.ifv-patches-mobile mark {
    background-color: #007bff80;
    border-radius: 4px;
    outline: 1px solid #007bff65;
}

.no-results-message {
    display: none;
    padding: 10px;
    text-align: center;
    font-size: 16px;
}

.ifv-patches-modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background: #00000000;
    transition: backdrop-filter 0.3s ease-in-out, background 0.3s ease-in-out;
}

.ifv-patches-modal-header {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
}

.ifv-patches-modal-header .ifv-logo {
    width: 40px;
    height: 40px;
    margin-right: 12px;
}

.ifv-patches-modal-header h1 {
    font-size: 24px;
    margin: 0;
    flex-grow: 1;
    color: #000;
}

.ifv-patches-modal-header button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    aspect-ratio: 1;
    margin-right: 7px;
}

.ifv-patches-modal > .patches-list,
.ifv-patches-mobile > .patches-list {
    font-family: "Google Sans", "Roboto", system-ui;
}

.ifv-patches-modal > .patches-list > .patch,
.ifv-patches-mobile > .patches-list > .patch {
    background-color: #ecedf7;
    padding: 15px;
    border-radius: 13px;
    margin-bottom: 10px;
}

.patch-header {
    margin-bottom: 5px;
}

.patch-name {
    font-size: 15px;
    font-weight: 600;
    color: #222;
}

.patch-description {
    font-size: 12px;
    color: #777;
}

.ifv-patches-modal .patch .settings-list,
.ifv-patches-mobile .patch .settings-list {
    background-color: #dde2f2;
    padding: 5px;
    border-radius: 11px;
    margin-top: 10px;
}

.settings-list .setting {
    border-bottom: 1px solid #ccc;
    padding: 10px;
}

.settings-list .setting:last-child {
    border-bottom: none;
}

.setting .separator {
    color: #999;
}

.setting-name {
    font-size: 12px;
    color: #222;
}

.setting-description {
    font-size: 12px;
    color: #777;
}

.setting-input input[type="text"],
.setting-input input[type="number"],
.setting-input input[type="color"],
.setting-input select {
    background-color: #f0f0f5;
    border: 1px solid #d0d0d5;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    color: #202022;
    box-sizing: border-box;
    transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    margin-top: 5px;
    width: 100%;
}

.setting-input input[type="text"]:focus,
.setting-input input[type="number"]:focus,
.setting-input input[type="color"]:focus,
.setting-input select:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 2px #007bff40;
    outline: none;
}

.setting-input select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23202022'%3E%3Cpath d='M7 10l5 5 5-5H7z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 18px;
    padding-right: 36px;
    width: 100%;
}

.setting-input input[type="color"] {
    padding: 5px;
    height: 40px;
    width: 100%;
}

.checkbox-item {
    display: flex;
    align-items: center;
    margin-top: 8px;
}

.checkbox-item input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background-color: #f0f0f5;
    border: 1px solid #d0d0d5;
    border-radius: 4px;
    cursor: pointer;
    position: relative;
    margin-right: 10px;
    transition: background-color 0.2s ease-in-out, border-color 0.2s ease-in-out;
}

.checkbox-item input[type="checkbox"]:checked {
    background-color: #007bff;
    border-color: #007bff;
}

.checkbox-item input[type="checkbox"]:checked::before {
    content: "";
    position: absolute;
    left: 6px;
    top: 2px;
    width: 5px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
}

.checkbox-item label {
    font-size: 14px;
    color: #202022;
    cursor: pointer;
    user-select: none;
}

.setting-multiselect .checkbox-item {
    margin-bottom: 5px;
}

.patches-list .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 25px;
    padding-top: 15px;
    border-top: 1px solid #e0e0e0;
}

@media (max-width: 425px) {
    .patches-list .buttons {
        flex-direction: column;
        align-items: stretch;
        margin-top: 15px;
        margin-inline: 10px;
    }
}

.apply-button,
.reset-button {
    padding: 10px 24px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out,
        border-color 0.2s ease-in-out, color 0.2s ease-in-out;
    border: 1px solid transparent;
    outline: none;
    line-height: 1.5;
}

.apply-button {
    background-color: #007bff;
    color: #ffffff;
    border-color: #007bff;
}

.apply-button:hover {
    background-color: #0056b3;
}

.apply-button:active {
    background-color: #b9d1ed;
}

.reset-button {
    background-color: transparent;
    color: #006bd6;
    border-color: #7fadda;
}

.reset-button:hover {
    background-color: #006bd614;
    border-color: #006bd6;
}

.reset-button:active {
    background-color: #006bd61f;
}

.ifv-patches-mobile > .patches-list {
    display: block !important;
    color: unset !important;
    font-size: unset !important;
    cursor: unset !important;
    padding-inline: 5px !important;
    padding-block: 15px !important;
    fill: unset !important;
    border-bottom: none !important;
    align-items: unset !important;
}

.setting-boolean-toggle {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 24px;
}

.setting-boolean-toggle .toggle-switch {
    position: absolute;
    top: 0;
    left: 0;
    width: 40px;
    height: 24px;
    background-color: #52525b;
    border-radius: 34px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.setting-boolean-toggle .toggle-switch::before {
    content: "";
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    background-color: #fff;
    box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.3);
    transition: transform 0.3s;
}

.setting-boolean-toggle .toggle-input:checked + .toggle-switch::before {
    transform: translateX(16px);
}

.setting-boolean-toggle .toggle-input:checked + .toggle-switch {
    background-color: #007bff;
}

.setting-boolean-toggle .toggle-input:checked + .toggle-switch::before {
    transform: translateX(16px);
}

.setting-boolean-toggle .toggle-input {
    display: none;
}

.setting:has(.setting-boolean-toggle) {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
`,
        /* IFV-RESKIN-CSS:START */
        "reskin/base.css": `
/* ==========================================================================
   IFV Reskin — a light mobile-first "native app" theme layer.
   This file is embedded verbatim into ifv.user.js by tools/embed-reskin.mjs
   (between the IFV-RESKIN-CSS markers). Edit here, not in the userscript.
   ========================================================================== */

html[data-ifv-reskin] {
    /* accent (overridden inline from settings) */
    --ifv-accent: #6366f1;
    --ifv-accent-soft: rgba(99, 102, 241, 0.12);
    --ifv-accent-text: #4f46e5;
    --ifv-accent-contrast: #ffffff;

    /* surfaces & text */
    --ifv-bg: #eef0f6;
    --ifv-bg-2: #e7eaf2;
    --ifv-surface: #ffffff;
    --ifv-surface-2: #f5f6fa;
    --ifv-surface-3: #eceef5;
    --ifv-text: #1b1e2a;
    --ifv-text-2: #666d7e;
    --ifv-text-3: #98a0b3;
    --ifv-line: #e6e8f0;
    --ifv-line-2: #d8dce7;

    /* elevation */
    --ifv-shadow: 0 1px 2px rgba(18, 22, 40, 0.05), 0 12px 30px -16px rgba(18, 22, 40, 0.28);
    --ifv-shadow-sm: 0 1px 2px rgba(18, 22, 40, 0.07);

    /* shape & motion */
    --ifv-radius: 18px;
    --ifv-radius-sm: 12px;
    --ifv-radius-xs: 10px;
    --ifv-nav-height: 62px;
    --ifv-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
    --ifv-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, "Noto Sans", sans-serif;

    /* bridge to the other redesign patches */
    --bottom-navbar-height: var(--ifv-nav-height);
    --background-primary: var(--ifv-surface);
    --background-navigation: var(--ifv-surface);
    --kolor-wcag: var(--ifv-accent-soft);

    color-scheme: light;
}

html[data-ifv-reskin][data-ifv-theme="dark"] {
    --ifv-accent: #8b92ff;
    --ifv-accent-soft: rgba(139, 146, 255, 0.22);
    --ifv-accent-text: #c4b5fd;
    --ifv-accent-contrast: #0d0f14;

    --ifv-bg: #0c0e13;
    --ifv-bg-2: #0f1218;
    --ifv-surface: #1b1f2a;
    --ifv-surface-2: #232733;
    --ifv-surface-3: #2a2f3d;
    --ifv-text: #f0f2f5;
    --ifv-text-2: #a0aec0;
    --ifv-text-3: #94a3b8;
    --ifv-line: #262b38;
    --ifv-line-2: #333a4b;

    --ifv-shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 16px 34px -18px rgba(0, 0, 0, 0.85);
    --ifv-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);

    color-scheme: dark;
}

/* ---------------------------------------------------------------- base --- */
html[data-ifv-reskin] body {
    background: var(--ifv-bg) !important;
    color: var(--ifv-text) !important;
    font-family: var(--ifv-font) !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-tap-highlight-color: transparent;
}

html[data-ifv-reskin] .app__main,
html[data-ifv-reskin] #root,
html[data-ifv-reskin] .app,
html[data-ifv-reskin] .mobile__frame {
    background: transparent !important;
    color: var(--ifv-text);
}

html[data-ifv-reskin] body.blue {
    background: var(--ifv-bg) !important;
}

html[data-ifv-reskin] ::selection {
    background: var(--ifv-accent-soft);
}

html[data-ifv-reskin] * {
    -webkit-tap-highlight-color: transparent;
}

/* ------------------------------------------------------------- app bar --- */
html[data-ifv-reskin] header.app__header {
    background: color-mix(in srgb, var(--ifv-surface) 86%, transparent) !important;
    backdrop-filter: saturate(180%) blur(18px);
    -webkit-backdrop-filter: saturate(180%) blur(18px);
    border-bottom: 1px solid var(--ifv-line) !important;
    box-shadow: none !important;
    height: calc(56px + env(safe-area-inset-top)) !important;
    padding-top: env(safe-area-inset-top);
}

html[data-ifv-reskin] .header_logo_tools_user-wrapper,
html[data-ifv-reskin] .header_logo_tools-container {
    height: 56px !important;
    min-height: 56px !important;
    align-items: center;
}

/* content scroll container sits below the fixed app bar and above the nav */
html[data-ifv-reskin] div#root {
    top: var(--ifv-header-h, 56px) !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    height: calc(
        100svh - var(--ifv-header-h, 56px) - var(--ifv-nav-height) - env(
                safe-area-inset-bottom
            )
    ) !important;
    overflow-x: hidden !important;
}

/* the messages button injected by another patch is 72px tall (20px padding)
   which clips inside the 56px bar — shrink it and cluster it on the right */
html[data-ifv-reskin] .header_logo_tools-container > div.messages {
    padding: 12px !important;
    float: none !important;
    margin-left: 0 !important;
    display: flex;
    align-items: center;
    justify-content: center;
}

html[data-ifv-reskin] .header_logo_tools-container > .ifv-theme-toggle {
    margin-left: auto !important;
    margin-right: 2px !important;
}

html[data-ifv-reskin] .header__hamburger__icon button,
html[data-ifv-reskin] .header__tools button {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .header__hamburger__icon svg,
html[data-ifv-reskin] .header__tools svg {
    fill: var(--ifv-text) !important;
}

html[data-ifv-reskin] .header__logo-product > span {
    color: var(--ifv-text) !important;
    font-weight: 700 !important;
    font-size: 18px !important;
    letter-spacing: -0.01em;
}

html[data-ifv-reskin] .header__logo-product > a > svg,
html[data-ifv-reskin] .header__logo-product > img {
    display: none !important;
}

/* theme toggle button injected by the reskin */
.ifv-theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    margin: 0 6px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ifv-text-2);
    cursor: pointer;
    transition: background-color 0.16s var(--ifv-ease), color 0.16s var(--ifv-ease);
}

.ifv-theme-toggle:hover {
    background: var(--ifv-surface-3);
    color: var(--ifv-text);
}

.ifv-theme-toggle:active {
    transform: scale(0.92);
}

.ifv-theme-toggle svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
}

/* -------------------------------------------------------- bottom nav --- */
html[data-ifv-reskin] .bottom-navigation-bar {
    background: color-mix(in srgb, var(--ifv-surface) 90%, transparent) !important;
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-top: 1px solid var(--ifv-line) !important;
    box-shadow: 0 -8px 30px -22px rgba(18, 22, 40, 0.6);
    top: auto !important;
    bottom: 0 !important;
    height: calc(var(--ifv-nav-height) + env(safe-area-inset-bottom)) !important;
    padding-bottom: env(safe-area-inset-bottom);
    gap: 2px;
    align-items: stretch !important;
}

html[data-ifv-reskin] .bottom-navigation-bar > div {
    color: var(--ifv-text-3) !important;
    -webkit-text-fill-color: var(--ifv-text-3) !important;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    padding: 7px 0 5px;
    border-radius: 14px;
    transition: color 0.16s var(--ifv-ease);
    justify-content: center;
}

html[data-ifv-reskin] .bottom-navigation-bar > div > div:has(img),
html[data-ifv-reskin] .bottom-navigation-bar > div > .ifv-nav-ico {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    min-width: 46px;
    padding: 0 14px;
    margin-bottom: 2px;
    border-radius: 15px;
    background: transparent;
    transition: background-color 0.18s var(--ifv-ease), transform 0.18s var(--ifv-ease);
}

html[data-ifv-reskin] .ifv-nav-ico svg {
    width: 22px;
    height: 22px;
    fill: var(--ifv-text-3) !important;
    display: block;
    transition: fill 0.16s var(--ifv-ease);
}

html[data-ifv-reskin] .bottom-navigation-bar > div:active > .ifv-nav-ico,
html[data-ifv-reskin] .bottom-navigation-bar > div:active > div:has(img) {
    transform: scale(0.9);
}

html[data-ifv-reskin] .bottom-navigation-bar > div.ifv-nav-active {
    color: var(--ifv-accent) !important;
    -webkit-text-fill-color: var(--ifv-accent) !important;
}

html[data-ifv-reskin] .bottom-navigation-bar > div.ifv-nav-active > .ifv-nav-ico,
html[data-ifv-reskin] .bottom-navigation-bar > div.ifv-nav-active > div:has(img) {
    background: var(--ifv-accent-soft);
}

html[data-ifv-reskin] .bottom-navigation-bar > div.ifv-nav-active .ifv-nav-ico svg {
    fill: var(--ifv-accent) !important;
}

/* keep the legacy highlight working too */
html[data-ifv-reskin] .bottom-navigation-bar > div > div:has(img.highlight) {
    background: var(--ifv-accent-soft) !important;
}

html[data-ifv-reskin] .bottom-navigation-bar > div > div > img {
    filter: none !important;
    opacity: 0.7;
    height: 22px !important;
}

html[data-ifv-reskin][data-ifv-theme="light"] .bottom-navigation-bar > div > div > img:not(.highlight) {
    filter: invert(0.55) !important;
    opacity: 0.85;
}

html[data-ifv-reskin] .bottom-navigation-bar > div > div > img.highlight {
    opacity: 1;
}

/* ------------------------------------------------------- cards/tiles --- */
/* Native app card system */
html[data-ifv-reskin] .tile {
    background: var(--ifv-surface) !important;
    border: 0 !important;
    border-radius: var(--ifv-radius) !important;
    box-shadow: var(--ifv-shadow) !important;
    color: var(--ifv-text) !important;
    overflow: hidden;
    transition: box-shadow 0.15s var(--ifv-ease), transform 0.15s var(--ifv-ease), background-color 0.15s var(--ifv-ease);
}

html[data-ifv-reskin] .tile:active {
    transform: scale(0.99);
    box-shadow: var(--ifv-shadow-sm) !important;
}

html[data-ifv-reskin] .tile__header {
    padding: 14px 16px !important;
    gap: 10px;
    align-items: center;
    border-bottom: 1px solid var(--ifv-line) !important;
    background: transparent !important;
    background-image: none !important;
}

html[data-ifv-reskin] .tile__header h2 {
    font-size: 15px !important;
    font-weight: 700 !important;
    color: var(--ifv-text) !important;
    letter-spacing: -0.01em;
    flex: 1;
}

html[data-ifv-reskin] .tile__link,
html[data-ifv-reskin] .tile a.simple_link,
html[data-ifv-reskin] a.simple_link {
    color: var(--ifv-accent) !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    padding: 4px 8px;
    border-radius: var(--ifv-radius-xs);
    transition: background-color 0.15s var(--ifv-ease);
}

html[data-ifv-reskin] .tile__link:active,
html[data-ifv-reskin] .tile a.simple_link:active {
    background: var(--ifv-accent-soft) !important;
}

html[data-ifv-reskin] .tile__content {
    padding: 14px 16px !important;
    color: var(--ifv-text) !important;
}

/* Tile size variants */
html[data-ifv-reskin] .tile__small {
    /* default card */
}

html[data-ifv-reskin] .tile__full-width-content {
    width: 100% !important;
}

html[data-ifv-reskin] .tile-with-boxes .tile__content {
    padding: 0 !important;
}

html[data-ifv-reskin] .tile-container {
    background: transparent !important;
    box-shadow: none !important;
    border: 0 !important;
    padding: 8px 12px 16px !important;
    gap: 10px !important;
}

/* Content containers — flattened: the page itself is the surface, content
   sits directly on it instead of inside another bordered box. */
html[data-ifv-reskin] .content-container {
    background: transparent !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
    padding: 8px 12px 16px !important;
}

html[data-ifv-reskin] .app__content {
    padding-top: 8px !important;
}

/* ---------------------------------------------------- accordions/grades --- */
/* Native accordion style */
html[data-ifv-reskin] .MuiAccordion-root {
    background: var(--ifv-surface) !important;
    color: var(--ifv-text) !important;
    border: 1px solid var(--ifv-line) !important;
    border-radius: var(--ifv-radius-sm) !important;
    box-shadow: var(--ifv-shadow-sm) !important;
    margin: 0 12px 8px !important;
    overflow: hidden;
}

html[data-ifv-reskin] .MuiAccordion-root.Mui-expanded {
    box-shadow: var(--ifv-shadow) !important;
    border-color: var(--ifv-accent) !important;
}

html[data-ifv-reskin] .MuiAccordion-root::before,
html[data-ifv-reskin] .MuiAccordion-root.Mui-expanded::before {
    display: none !important;
}

html[data-ifv-reskin] .MuiAccordionSummary-root {
    min-height: 56px !important;
    padding: 0 16px !important;
}

html[data-ifv-reskin] .MuiAccordionSummary-content,
html[data-ifv-reskin] .MuiAccordionSummary-content.Mui-expanded {
    margin: 12px 0 !important;
    font-weight: 600;
    font-size: 15px !important;
}

html[data-ifv-reskin] .MuiAccordionSummary-expandIconWrapper {
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin] .MuiAccordionDetails-root {
    padding: 12px !important;
}

html[data-ifv-reskin] .MuiDivider-root {
    border-color: var(--ifv-line) !important;
}

/* Grade tiles inside accordions */
html[data-ifv-reskin] .accordion__full-width__content .tile,
html[data-ifv-reskin] .accordion__full-width__content .box {
    margin: 4px 0 !important;
    border-radius: var(--ifv-radius-sm) !important;
    box-shadow: var(--ifv-shadow-sm) !important;
    border: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .accordion__full-width__content .tile__header {
    padding: 8px 10px !important;
    background: transparent !important;
    border: 0 !important;
}

html[data-ifv-reskin] .accordion__full-width__content .tile__header h2 {
    font-size: 14px !important;
    font-weight: 600 !important;
}

html[data-ifv-reskin] .accordion__full-width__content .tile__content {
    padding: 10px 14px !important;
}

/* Grade rows - compact journal style */
html[data-ifv-reskin] .grades__subject {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 10px 12px !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    border-top: 0 !important;
    border-left: 0 !important;
    border-right: 0 !important;
    border-radius: 0 !important;
    margin-bottom: 0 !important;
    background: transparent !important;
    gap: 12px;
    min-height: 44px;
}

html[data-ifv-reskin] .grades__subject:last-child {
    border-bottom: 0 !important;
    margin-bottom: 0 !important;
}

html[data-ifv-reskin] .grades__button {
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent-text) !important;
    border-radius: var(--ifv-radius-xs) !important;
    padding: 4px 10px !important;
    font-weight: 700 !important;
    font-size: 13px !important;
    min-width: 48px;
    text-align: center;
}

html[data-ifv-reskin] .grades__button {
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent-text) !important;
    border-radius: var(--ifv-radius-xs) !important;
    padding: 4px 10px !important;
    font-weight: 700 !important;
    font-size: 13px !important;
    min-width: 48px;
    text-align: center;
}

html[data-ifv-reskin] .grades__button__content {
    color: var(--ifv-accent-text) !important;
}

/* Compact journal-style grade rows (DOM-restructured) */
html[data-ifv-reskin] .subject-row {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    padding: 8px 12px !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    background: transparent !important;
    gap: 12px !important;
    min-height: 44px !important;
    transition: background-color 0.15s var(--ifv-ease) !important;
}

html[data-ifv-reskin] .subject-row:active {
    background: var(--ifv-surface-2) !important;
}

html[data-ifv-reskin] .subject-row:last-child {
    border-bottom: 0 !important;
}

html[data-ifv-reskin] .subject-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    flex: 1 1 auto !important;
    min-width: 0 !important;
}

html[data-ifv-reskin] .subject-name {
    font-size: 15px !important;
    font-weight: 500 !important;
    color: var(--ifv-text) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    margin: 0 !important;
}

html[data-ifv-reskin] .grades-list {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 4px !important;
}

html[data-ifv-reskin] .grade-badge,
html[data-ifv-reskin] button.grade-badge {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-width: 32px !important;
    height: 28px !important;
    padding: 0 8px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
    background: var(--ifv-surface-2) !important;
    border: 1px solid var(--ifv-line) !important;
    white-space: nowrap !important;
    cursor: pointer !important;
    transition: background-color 0.15s var(--ifv-ease), border-color 0.15s var(--ifv-ease), transform 0.1s var(--ifv-ease) !important;
    box-shadow: none !important;
}

html[data-ifv-reskin] .grade-badge:hover,
html[data-ifv-reskin] button.grade-badge:hover,
html[data-ifv-reskin] .grade-badge:active,
html[data-ifv-reskin] button.grade-badge:active {
    background: var(--ifv-accent-soft) !important;
    border-color: var(--ifv-accent) !important;
    transform: scale(1.02) !important;
}

html[data-ifv-reskin] .subject-stats {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    flex: 0 0 auto !important;
    text-align: right !important;
}

html[data-ifv-reskin] .average-box {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 1px !important;
}

html[data-ifv-reskin] .average-label {
    font-size: 9px !important;
    font-weight: 500 !important;
    color: var(--ifv-text-3) !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
}

html[data-ifv-reskin] .average-value {
    font-size: 16px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
    line-height: 1 !important;
}

html[data-ifv-reskin] .details-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--ifv-text-3) !important;
    cursor: pointer !important;
    transition: background-color 0.15s var(--ifv-ease), color 0.15s var(--ifv-ease), transform 0.1s var(--ifv-ease) !important;
}

html[data-ifv-reskin] .details-btn:hover,
html[data-ifv-reskin] .details-btn:active {
    background: var(--ifv-surface-2) !important;
    color: var(--ifv-text) !important;
    transform: scale(1.05) !important;
}

html[data-ifv-reskin] .details-btn:focus-visible {
    outline: 2px solid var(--ifv-accent) !important;
    outline-offset: 2px !important;
}

html[data-ifv-reskin] .details-btn svg {
    width: 18px !important;
    height: 18px !important;
    fill: currentColor !important;
}

/* ---------------------------------------------------- Tablica (Dashboard) --- */
/* Rebuilt tiles: badge header + flat content lists matching the lesson cards. */

html[data-ifv-reskin] .ifv-dash {
    font-family: var(--ifv-font);
}

html[data-ifv-reskin] .ifv-dash .tile {
    border-radius: var(--ifv-radius) !important;
    background: var(--ifv-surface) !important;
    box-shadow: var(--ifv-shadow-sm) !important;
    border: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .ifv-dash__tile--empty {
    opacity: 1 !important;
}

/* --- tile header --- */
html[data-ifv-reskin] .ifv-dash__head {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 14px 16px 10px !important;
    border-bottom: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .ifv-dash__head .flex__item-auto {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    min-width: 0;
}

html[data-ifv-reskin] .ifv-dash__ico {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--ifv-radius-xs);
    background: var(--ifv-accent-soft);
}

html[data-ifv-reskin] .ifv-dash__ico img {
    width: 18px !important;
    height: 18px !important;
    filter: none !important;
}

html[data-ifv-reskin] .ifv-dash__head h2 {
    margin: 0 !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    letter-spacing: 0.01em;
    color: var(--ifv-text) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-dash__head .toolbar {
    margin-left: auto !important;
}

html[data-ifv-reskin] .ifv-dash__head .tile__link {
    display: inline-flex !important;
    align-items: center !important;
    height: 26px !important;
    padding: 0 10px !important;
    border-radius: 999px !important;
    background: var(--ifv-surface-3) !important;
    color: var(--ifv-text-2) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-decoration: none !important;
}

/* --- content lists --- */
html[data-ifv-reskin] .ifv-dash__list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px 14px !important;
}

html[data-ifv-reskin] .ifv-dash__group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

html[data-ifv-reskin] .ifv-dash__group + .ifv-dash__group {
    margin-top: 6px;
}

html[data-ifv-reskin] .ifv-dash__day {
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ifv-text-3) !important;
    padding: 2px 2px 4px !important;
}

/* --- schedule rows --- */
html[data-ifv-reskin] .ifv-dash__lesson {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 8px 0 !important;
    border-bottom: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .ifv-dash__lesson:last-child {
    border-bottom: 0 !important;
}

html[data-ifv-reskin] .ifv-dash__time {
    flex: 0 0 auto;
    width: 92px;
    font-size: 11.5px !important;
    font-weight: 700 !important;
    color: var(--ifv-text-2) !important;
    font-variant-numeric: tabular-nums;
}

html[data-ifv-reskin] .ifv-dash__lesson-body {
    flex: 1 1 auto;
    min-width: 0;
}

html[data-ifv-reskin] .ifv-dash__subject {
    font-size: 13.5px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-dash__meta {
    font-size: 11px !important;
    color: var(--ifv-text-3) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-dash__chip {
    flex: 0 0 auto;
    align-self: center;
    font-size: 9.5px !important;
    font-weight: 700 !important;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    padding: 3px 8px !important;
    border-radius: 999px !important;
    background: var(--ifv-surface-3) !important;
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin] .ifv-dash__chip--canceled {
    background: rgba(220, 38, 38, 0.12) !important;
    color: #dc2626 !important;
}

html[data-ifv-reskin] .ifv-dash__chip--substitute {
    background: rgba(234, 179, 8, 0.16) !important;
    color: #a16207 !important;
}

html[data-ifv-reskin] .ifv-dash__chip--conflicted,
html[data-ifv-reskin] .ifv-dash__chip--info {
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent-text) !important;
}

html[data-ifv-reskin] .ifv-dash__lesson--canceled .ifv-dash__subject {
    color: var(--ifv-text-3) !important;
    text-decoration: line-through;
}

/* --- frequency list (reuses .ifv-lesson attendance cards) --- */
html[data-ifv-reskin] .ifv-dash__freq > .ifv-dash__group > .ifv-lesson {
    border-bottom: 1px solid var(--ifv-line);
}

html[data-ifv-reskin] .ifv-dash__freq > .ifv-dash__group > .ifv-lesson:last-child {
    border-bottom: 0;
}

/* --- native rows (tests, duty, important) --- */
html[data-ifv-reskin] .ifv-dash .tile__content__title,
html[data-ifv-reskin] .ifv-dash .tile__important-text {
    color: var(--ifv-text-3) !important;
    font-weight: 700 !important;
    font-size: 11px !important;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

html[data-ifv-reskin] .ifv-dash__rows {
    list-style: none !important;
    margin: 0 !important;
    padding: 0 !important;
}

html[data-ifv-reskin] .ifv-dash__row {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 10px 14px !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    color: var(--ifv-text) !important;
    font-size: 13.5px !important;
    font-weight: 600 !important;
}

html[data-ifv-reskin] .ifv-dash__row:last-child {
    border-bottom: 0 !important;
}

/* --- exam cards (sprawdziany) --- */
html[data-ifv-reskin] .ifv-dash__exams > .ifv-dash__group {
    gap: 8px;
}

html[data-ifv-reskin] .ifv-dash__exam {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px !important;
    border-radius: var(--ifv-radius-sm) !important;
    background: var(--ifv-surface-2) !important;
    border: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .ifv-dash__exam-body {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
}

html[data-ifv-reskin] .ifv-dash__exam-body .ifv-dash__subject {
    font-size: 13.5px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-dash__exam-body .ifv-dash__chip {
    align-self: center;
}

html[data-ifv-reskin] .ifv-dash__exam-go {
    flex: 0 0 auto;
    margin-left: auto !important;
    color: var(--ifv-text-3) !important;
}

html[data-ifv-reskin] .ifv-dash .tile__list__rectangle__bold {
    color: var(--ifv-text) !important;
    font-weight: 600 !important;
    font-size: 13.5px !important;
}

html[data-ifv-reskin] .ifv-dash .tile__list__rectangle__ribbon {
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent-text) !important;
    border-radius: 999px !important;
    padding: 3px 8px !important;
    font-size: 9.5px !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
    margin-left: 8px !important;
}

html[data-ifv-reskin] .ifv-dash .details-btn--appearance {
    margin-left: auto !important;
    color: var(--ifv-text-3) !important;
}

/* --- empty states --- */
html[data-ifv-reskin] .ifv-dash .tile__grades,
html[data-ifv-reskin] .ifv-dash .tile__empty-bg {
    background: transparent !important;
    border-radius: 0 0 var(--ifv-radius) var(--ifv-radius) !important;
}

html[data-ifv-reskin] .ifv-dash .tile__empty__content,
html[data-ifv-reskin] .ifv-dash .ifv-empty {
    display: block;
    color: var(--ifv-text-3) !important;
    font-size: 12.5px !important;
    font-weight: 500 !important;
    padding: 18px 14px !important;
    text-align: center;
}

/* --- teachers list --- */
html[data-ifv-reskin] .tile__teachers__item {
    padding: 12px 0 !important;
    border-bottom: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .tile__teachers__item:last-child {
    border-bottom: 0 !important;
}

html[data-ifv-reskin] .tile__teacher__type {
    display: inline-block !important;
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent-text) !important;
    border-radius: var(--ifv-radius-xs) !important;
    padding: 2px 8px !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    margin-bottom: 4px !important;
}

html[data-ifv-reskin] .tile__teacher__name {
    color: var(--ifv-text) !important;
    font-weight: 600 !important;
    font-size: 14px !important;
}

/* --- grades since last login --- */
html[data-ifv-reskin] .ifv-dash .tile__grades {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 14px !important;
    background: transparent !important;
}

html[data-ifv-reskin] .ifv-dash .tile__grades__item {
    background: var(--ifv-surface-2) !important;
    border: 1px solid var(--ifv-line) !important;
    border-radius: var(--ifv-radius-sm) !important;
    padding: 12px 14px !important;
    gap: 4px !important;
}

html[data-ifv-reskin] .ifv-dash .tile__grades__subject {
    color: var(--ifv-text) !important;
    font-weight: 600 !important;
    font-size: 13.5px !important;
}

html[data-ifv-reskin] .ifv-dash .tile__grades__marks {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    justify-content: flex-end !important;
}

html[data-ifv-reskin] .ifv-dash .tile__grades__rect {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    border-radius: 10px !important;
    background: var(--ifv-surface-3) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
}

html[data-ifv-reskin] .ifv-dash .tile__grades__rect__content {
    font-size: 16px !important;
    font-weight: 700 !important;
    line-height: 1;
}

/* --- hide the app's native/legacy markup behind rebuilt lists --- */
html[data-ifv-reskin] .ifv-dash__hide-native .lessons-container,
html[data-ifv-reskin] .ifv-dash__hide-native .plan-zajec,
html[data-ifv-reskin] .ifv-dash__hide-native .tile__frequency__day,
html[data-ifv-reskin] .ifv-dash__hide-native .tile__exam__day {
    display: none !important;
}

/* --- info toolbar chips --- */
html[data-ifv-reskin] .ifv-dash .dashboard-info-toolbar {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
    height: auto !important;
    max-height: none !important;
    margin: 0 0 2px !important;
}

html[data-ifv-reskin] .ifv-dash .dashboard-info-toolbar > div {
    display: inline-flex !important;
    flex: 0 0 auto !important;
    width: auto !important;
    align-items: center !important;
    gap: 6px !important;
    height: 30px !important;
    padding: 0 12px !important;
    border-radius: 999px !important;
    background: var(--ifv-surface) !important;
    border: 1px solid var(--ifv-line) !important;
    color: var(--ifv-text-2) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    box-shadow: var(--ifv-shadow-sm);
}

html[data-ifv-reskin] .ifv-dash .dashboard-info-toolbar > div img {
    width: 16px !important;
    height: 16px !important;
    opacity: 0.85;
    filter: invert(0.5) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"]
    .ifv-dash
    .dashboard-info-toolbar
    > div
    img {
    filter: none !important;
}

/* header messages button icon (black SVG) must follow the theme ink */
html[data-ifv-reskin] .header_logo_tools-container > div.messages {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .header_logo_tools-container > div.messages svg,
html[data-ifv-reskin] .header_logo_tools-container > div.messages svg path,
html[data-ifv-reskin] .header_logo_tools-container > div.messages svg * {
    fill: var(--ifv-text) !important;
    color: var(--ifv-text) !important;
}

/* --- widget grid --- */
html[data-ifv-reskin] .ifv-dash .tile-subcontainer {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
    align-items: start !important;
}

html[data-ifv-reskin] .ifv-dash .tile-subcontainer > .dashboard-info-toolbar,
html[data-ifv-reskin] .ifv-dash .ifv-dash__tile--schedule,
html[data-ifv-reskin] .ifv-dash .ifv-dash__tile--freq,
html[data-ifv-reskin] .ifv-dash .ifv-dash__tile--exams {
    grid-column: 1 / -1 !important;
}

html[data-ifv-reskin] .ifv-dash .ifv-dash__tile {
    min-width: 0;
    overflow: hidden;
}

/* half-width widget header is tighter and wraps */
html[data-ifv-reskin] .ifv-dash__tile:not(.ifv-dash__tile--schedule):not(.ifv-dash__tile--freq):not(.ifv-dash__tile--exams) .ifv-dash__head {
    padding: 12px 12px 8px !important;
    gap: 9px !important;
}

html[data-ifv-reskin] .ifv-dash__tile:not(.ifv-dash__tile--schedule):not(.ifv-dash__tile--freq):not(.ifv-dash__tile--exams) .ifv-dash__head h2 {
    white-space: normal !important;
    font-size: 12.5px !important;
    line-height: 1.2;
}

/* ------------------------------------------------------------- buttons --- */
html[data-ifv-reskin] .MuiButtonBase-root,
html[data-ifv-reskin] button {
    font-family: var(--ifv-font);
}

html[data-ifv-reskin] .MuiButton-containedPrimary,
html[data-ifv-reskin] .MuiButton-contained.MuiButton-containedPrimary {
    background-color: var(--ifv-accent) !important;
    color: var(--ifv-accent-contrast) !important;
    box-shadow: none !important;
    border-radius: var(--ifv-radius-sm);
}

html[data-ifv-reskin] .MuiTabs-indicator {
    background-color: var(--ifv-accent) !important;
    border-radius: 3px;
}

html[data-ifv-reskin] .MuiTab-root.Mui-selected {
    color: var(--ifv-accent) !important;
}

/* --------------------------------------------------------------- drawer --- */
html[data-ifv-reskin] aside,
html[data-ifv-reskin] .MuiDrawer-paper {
    background: var(--ifv-surface) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] aside nav a,
html[data-ifv-reskin] aside nav li,
html[data-ifv-reskin] aside a {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] aside nav ul li a {
    border-radius: var(--ifv-radius-sm);
}

html[data-ifv-reskin] .MuiListItem-root:hover {
    background: var(--ifv-surface-2) !important;
}

/* --------------------------- detail panel: right drawer -> centered dialog --- */
/* The app opens item details ("Szczegóły") in a MuiDrawer anchored to the
   right. Reskin turns that into a centred modal card with a close button. */
html[data-ifv-reskin] .MuiDrawer-root:has(.modal) .MuiBackdrop-root {
    background: rgba(6, 8, 15, 0.55) !important;
    opacity: 1 !important;
    transition: none !important;
}

html[data-ifv-reskin] .MuiDrawer-paper:has(.modal) {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    right: auto !important;
    bottom: auto !important;
    width: min(92vw, 440px) !important;
    max-width: 440px !important;
    height: auto !important;
    max-height: 82vh !important;
    margin: 0 !important;
    border-radius: var(--ifv-radius) !important;
    background: var(--ifv-surface) !important;
    color: var(--ifv-text) !important;
    box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.55) !important;
    transform: translate(-50%, -50%) !important;
    overflow: hidden !important;
    animation: ifv-modal-in 0.2s var(--ifv-ease) both;
}

@keyframes ifv-modal-in {
    from {
        opacity: 0;
        transform: translate(-50%, calc(-50% + 14px)) scale(0.96);
    }
    to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
}

html[data-ifv-reskin] .MuiDrawer-paper:has(.modal) .modal {
    display: flex;
    flex-direction: column;
    width: 100% !important;
    height: auto !important;
    max-height: inherit !important;
    box-sizing: border-box;
    background: transparent !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal__header {
    position: relative;
    flex: 0 0 auto;
    height: auto !important;
    min-height: 0 !important;
    padding: 16px 56px 14px 18px !important;
    background: transparent !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal__header .modal__title h1,
html[data-ifv-reskin] .modal__title h1,
html[data-ifv-reskin] .modal__header .modal__title * {
    margin: 0 !important;
    font-size: 16px !important;
    font-weight: 700 !important;
    color: var(--ifv-text) !important;
}

/* close button -> minimal icon only, no text */
html[data-ifv-reskin] .modal-button--close,
html[data-ifv-reskin] .modal-button--close.MuiIconButton-root {
    position: absolute !important;
    top: 12px !important;
    right: 12px !important;
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    min-height: 36px !important;
    padding: 0 !important;
    border-radius: 999px !important;
    background: transparent !important;
    color: var(--ifv-text-2) !important;
    font-size: 20px !important;
    line-height: 1 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
}

html[data-ifv-reskin] .modal-button--close::before {
    content: "—" !important;
}

html[data-ifv-reskin] .modal-button--close svg {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    width: 0 !important;
    height: 0 !important;
}

html[data-ifv-reskin] .modal-button--close:hover {
    background: var(--ifv-surface-3) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal__content {
    flex: 1 1 auto;
    overflow-y: auto;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
    padding: 16px 20px 20px !important;
    background: var(--ifv-surface) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal__footer {
    flex: 0 0 auto;
    display: flex !important;
    flex-wrap: wrap;
    gap: 10px !important;
    justify-content: flex-end !important;
    padding-top: 14px !important;
    background: transparent !important;
    border-top: 1px solid var(--ifv-line) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal__footer .MuiButton-root {
    font-family: var(--ifv-font) !important;
    font-size: 13.5px !important;
    font-weight: 600 !important;
    text-transform: none !important;
    border-radius: var(--ifv-radius-sm) !important;
    padding: 10px 20px !important;
    min-width: 88px !important;
    height: 40px !important;
    box-shadow: none !important;
}

html[data-ifv-reskin] .modal__footer .MuiButton-containedPrimary,
html[data-ifv-reskin] .modal__footer .MuiButton-contained.primary-button,
html[data-ifv-reskin] .modal__footer .MuiButton-contained.default-button {
    background: var(--ifv-accent) !important;
    color: var(--ifv-accent-contrast) !important;
}

html[data-ifv-reskin] .modal__footer .MuiButton-containedPrimary:hover,
html[data-ifv-reskin] .modal__footer .MuiButton-contained.primary-button:hover,
html[data-ifv-reskin] .modal__footer .MuiButton-contained.default-button:hover {
    background: var(--ifv-accent) !important;
    opacity: 0.9;
    box-shadow: none !important;
}

html[data-ifv-reskin] .modal__footer .MuiButton-outlined,
html[data-ifv-reskin] .modal__footer .MuiButton-outlinedPrimary,
html[data-ifv-reskin] .modal__footer button:not(.MuiButton-contained) {
    background: transparent !important;
    color: var(--ifv-accent) !important;
    border: 1.5px solid var(--ifv-accent) !important;
}

html[data-ifv-reskin] .modal__footer .MuiButton-outlined:hover,
html[data-ifv-reskin] .modal__footer .MuiButton-outlinedPrimary:hover,
html[data-ifv-reskin] .modal__footer button:not(.MuiButton-contained):hover {
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent) !important;
}

/* modal data box: subtle surface for both themes */
html[data-ifv-reskin] .modal .details__content__box,
html[data-ifv-reskin] .modal .modal__box {
    background: var(--ifv-surface-2) !important;
    border: 1px solid var(--ifv-line) !important;
    border-radius: var(--ifv-radius-sm) !important;
    color: var(--ifv-text) !important;
    overflow: visible;
}

html[data-ifv-reskin] .modal .details__content__box__header {
    background: transparent !important;
    border-bottom: 0 !important;
    padding: 0 2px 16px !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal .details__content__box__header h2,
html[data-ifv-reskin] .modal .details__content__box__header h2 * {
    margin: 0 !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .modal .details__content__box__content {
    background: transparent !important;
    color: var(--ifv-text) !important;
}

/* grade detail: label above value, no divider bars under each record */
html[data-ifv-reskin] .modal .info-row {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 3px !important;
    padding: 0 2px 16px !important;
    border: 0 !important;
    background: transparent !important;
}

html[data-ifv-reskin] .modal .info-row:last-child {
    padding-bottom: 0 !important;
}

html[data-ifv-reskin] .modal .details__content__box__content .info-label span {
    display: block;
    color: var(--ifv-text-3) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.07em !important;
}

html[data-ifv-reskin] .modal .info-text {
    color: var(--ifv-text) !important;
    font-size: 14.5px !important;
    font-weight: 600 !important;
}

html[data-ifv-reskin] .modal .details__content__box__content .info-text span {
    font-size: 14.5px !important;
    font-weight: 600 !important;
}

html[data-ifv-reskin] .modal .details__content__box__content .info-text .tile__important-text {
    font-size: 16px !important;
    font-weight: 700 !important;
}

html[data-ifv-reskin] .modal .modal__plan-details__row {
    display: flex !important;
    align-items: flex-start !important;
    gap: 12px !important;
    padding: 8px 2px !important;
    font-size: 13.5px !important;
    color: var(--ifv-text) !important;
    border: 0 !important;
}

html[data-ifv-reskin] .modal .modal__plan-details__row:last-child {
    padding-bottom: 0 !important;
}

html[data-ifv-reskin] .modal .modal__plan-details__row svg {
    flex: 0 0 auto;
    width: 17px !important;
    height: 17px !important;
    margin-top: 1px;
    fill: var(--ifv-text-3) !important;
    color: var(--ifv-text-3) !important;
}

/* keep semantic colours (grade values), force the rest to theme text */
html[data-ifv-reskin] .modal .details__content__box__content h3,
html[data-ifv-reskin] .modal .details__content__box__content p,
html[data-ifv-reskin] .modal .details__content__box__content strong,
html[data-ifv-reskin] .modal .details__content__box__content b {
    color: var(--ifv-text) !important;
}

/* the "Więcej" / list modals */
html[data-ifv-reskin] .list-modal,
html[data-ifv-reskin] .more-popup {
    background: var(--ifv-bg) !important;
    color: var(--ifv-text) !important;
    font-family: var(--ifv-font) !important;
}

html[data-ifv-reskin] .list-modal > div:first-of-type {
    background: color-mix(in srgb, var(--ifv-surface) 92%, transparent) !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin] .list-modal > div:first-of-type > h1 {
    color: var(--ifv-text) !important;
    font-weight: 700;
}

html[data-ifv-reskin] .list-modal > div:first-of-type > img {
    filter: none !important;
    opacity: 0.75;
}

html[data-ifv-reskin] .list-modal > div:last-of-type > div {
    color: var(--ifv-text) !important;
    fill: var(--ifv-text) !important;
    border-bottom: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .list-modal > div:last-of-type > div:active {
    background: var(--ifv-surface-2);
}

html[data-ifv-reskin] .list-modal > div:last-of-type > div > .icon {
    filter: none !important;
    color: var(--ifv-text-2);
}

/* --------------------------------------------------------- misc polish --- */
html[data-ifv-reskin] .spinner {
    border-color: var(--ifv-accent) transparent transparent transparent;
}

html[data-ifv-reskin] ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

html[data-ifv-reskin] ::-webkit-scrollbar-thumb {
    background: var(--ifv-line-2);
    border-radius: 8px;
}

html[data-ifv-reskin] a {
    color: var(--ifv-accent);
}

/* ----------------------------------------- readability / palette fixes --- */
/* one consistent accent: profile avatar + notification badges */
html[data-ifv-reskin] .user-avatar {
    background: var(--ifv-accent) !important;
    color: var(--ifv-accent-contrast) !important;
}

html[data-ifv-reskin] .user-avatar span,
html[data-ifv-reskin] .user-avatar * {
    color: var(--ifv-accent-contrast) !important;
}

html[data-ifv-reskin] .MuiBadge-badge {
    background: var(--ifv-accent) !important;
    color: var(--ifv-accent-contrast) !important;
    font-weight: 700;
}

/* tags / ribbons such as "kartkówka" — never plain white */
html[data-ifv-reskin] .tile__list__rectangle__ribbon,
html[data-ifv-reskin] .tag,
html[data-ifv-reskin] .MuiChip-root,
html[data-ifv-reskin] .tile__grade-tag {
    background: var(--ifv-accent-soft) !important;
    color: var(--ifv-accent-text) !important;
    border: 0 !important;
    font-weight: 700;
}

/* ------------------------------------------------ native mobile polish --- */
/* page/section headers: clear hierarchy like a native app */
html[data-ifv-reskin] .content__header {
    padding: 6px 4px 10px !important;
    gap: 4px;
}

html[data-ifv-reskin] .content__header__info-big,
html[data-ifv-reskin] .content__header > h2 {
    font-size: 20px !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin: 0 !important;
}

html[data-ifv-reskin] .content__header__info-subheader {
    font-size: 13px !important;
    font-weight: 500 !important;
    margin-top: 2px !important;
}

/* card / row press feedback */
html[data-ifv-reskin] .tile:active,
html[data-ifv-reskin] .MuiAccordion-root:active,
html[data-ifv-reskin] .list-modal > div:last-of-type > div:active {
    transform: scale(0.992);
}

/* buttons: comfortable, non-capitalised tap targets */
html[data-ifv-reskin] .MuiButton-root {
    border-radius: var(--ifv-radius-sm) !important;
    min-height: 42px;
    text-transform: none !important;
    font-weight: 600 !important;
    letter-spacing: 0 !important;
}

/* inputs / selects */
html[data-ifv-reskin] .MuiOutlinedInput-root {
    border-radius: var(--ifv-radius-sm) !important;
}

/* friendly, centred empty states */
html[data-ifv-reskin] .tile__empty-container,
html[data-ifv-reskin] .tile__empty-text,
html[data-ifv-reskin] .tile__grades {
    text-align: center;
    justify-content: center;
}

/* dark-mode: replace hardcoded white/light surfaces with theme surfaces */
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__content,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__empty-container {
    background-color: transparent !important;
    background-image: none !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .tile__empty-bg,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__grades {
    background-color: var(--ifv-surface-2) !important;
    background-image: none !important;
    color: var(--ifv-text-2) !important;
}

/* soften the diagonal stripes so they don't glare on dark */
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__empty-bg {
    background-image: repeating-linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.015),
        rgba(255, 255, 255, 0.015) 10px,
        rgba(255, 255, 255, 0.04),
        rgba(255, 255, 255, 0.04) 12px
    ) !important;
}

/* attendance / segmented tabs also ship hardcoded white */
html[data-ifv-reskin][data-ifv-theme="dark"] .tabsview,
html[data-ifv-reskin][data-ifv-theme="dark"] .tabsview__header,
html[data-ifv-reskin][data-ifv-theme="dark"] .tabsview__tabs,
html[data-ifv-reskin][data-ifv-theme="dark"] .cell,
html[data-ifv-reskin][data-ifv-theme="dark"] .column__content {
    background-color: var(--ifv-surface) !important;
    background-image: none !important;
    color: var(--ifv-text) !important;
}

/* week selector arrows keep a hardcoded bg that ignores overrides — paint it
   away with an inset shadow instead, and recolour the arrow itself */
html[data-ifv-reskin][data-ifv-theme="dark"] .week-selector .MuiIconButton-root,
html[data-ifv-reskin][data-ifv-theme="dark"] .month-selector .MuiIconButton-root {
    background-color: var(--ifv-surface) !important;
    box-shadow: inset 0 0 0 100px var(--ifv-surface) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .week-selector .MuiIconButton-root svg,
html[data-ifv-reskin][data-ifv-theme="dark"] .month-selector .MuiIconButton-root svg {
    fill: var(--ifv-text-2) !important;
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .tabsview__header {
    border-color: var(--ifv-line) !important;
}

/* attendance status chips: "present" ships a hardcoded white bg with light text */
html[data-ifv-reskin][data-ifv-theme="dark"] .frequency-position__one-item {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .frequency-position__one-item.obecnosc,
html[data-ifv-reskin][data-ifv-theme="dark"] .frequency-position__one-item.usprawiedliwione {
    background-color: rgba(34, 197, 94, 0.16) !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .frequency-position__one-item.nieobecnyZPrzyczynSzkolnych,
html[data-ifv-reskin][data-ifv-theme="dark"] .frequency-position__one-item.zwolnienie {
    background-color: rgba(148, 163, 184, 0.18) !important;
    color: var(--ifv-text) !important;
}

/* dashboard info chips ("-", counters) */
html[data-ifv-reskin][data-ifv-theme="dark"] .dashboard-info-toolbar > div,
html[data-ifv-reskin][data-ifv-theme="dark"] .dashboard-info-toolbar > div > div {
    background-color: var(--ifv-surface-2) !important;
    color: var(--ifv-text) !important;
}

/* secondary / empty-state labels must stay legible */
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__empty-text,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__empty-container,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__content__title {
    color: var(--ifv-text-2) !important;
}

/* PrimeReact datatables ship white headers/rows and white empty messages */
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-wrapper,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-table,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-thead > tr > th,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-tbody > tr,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-tbody > tr > td,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-emptymessage,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-emptymessage > td {
    background-color: var(--ifv-surface) !important;
    background-image: none !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-thead > tr > th,
html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-tbody > tr > td {
    border-color: var(--ifv-line) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-thead > tr > th {
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .p-datatable-tbody > tr:hover {
    background-color: var(--ifv-surface-2) !important;
}

/* grade tiles: numbers/labels render in the app's dark ink on dark cards */
html[data-ifv-reskin][data-ifv-theme="dark"] .grades__subject,
html[data-ifv-reskin][data-ifv-theme="dark"] .grades__button,
html[data-ifv-reskin][data-ifv-theme="dark"] .grades__button__content,
html[data-ifv-reskin][data-ifv-theme="dark"] .grades__combo,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiButton-root.MuiButton-text,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiButton-root.MuiButton-text * {
    color: var(--ifv-text) !important;
}

/* form controls / comboboxes */
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiFormLabel-root,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiInputLabel-root {
    color: var(--ifv-text-2) !important;
    background-color: transparent !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .MuiInputBase-root,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiOutlinedInput-root,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiSelect-nativeInput {
    background-color: transparent !important;
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .MuiInputBase-input,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiSelect-select {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .MuiOutlinedInput-notchedOutline {
    border-color: var(--ifv-line-2) !important;
}

/* info rows / accordions use the app's dark ink on dark cards */
html[data-ifv-reskin][data-ifv-theme="dark"] .info-label,
html[data-ifv-reskin][data-ifv-theme="dark"] .info-label span,
html[data-ifv-reskin][data-ifv-theme="dark"] .info-label > * {
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .info-text,
html[data-ifv-reskin][data-ifv-theme="dark"] .info-text span,
html[data-ifv-reskin][data-ifv-theme="dark"] .info-text > *,
html[data-ifv-reskin][data-ifv-theme="dark"] .info-row,
html[data-ifv-reskin][data-ifv-theme="dark"] .info-column {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .MuiAccordionSummary-content,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiAccordionSummary-content > h2,
html[data-ifv-reskin][data-ifv-theme="dark"] .accordion__item-selected,
html[data-ifv-reskin][data-ifv-theme="dark"] .accordion__full-width__header,
html[data-ifv-reskin][data-ifv-theme="dark"] .accordion__full-width__header > * {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .MuiAccordionSummary-expandIconWrapper svg {
    fill: var(--ifv-text-2) !important;
    color: var(--ifv-text-2) !important;
}

/* the app is light-only and hardcodes a dark ink (#3d4455) in many components;
   recolour it so text stays legible on the dark surfaces */
html[data-ifv-reskin][data-ifv-theme="dark"] #root {
    color: var(--ifv-text);
}

html[data-ifv-reskin][data-ifv-theme="dark"] header.app__header,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__header,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__header *,
html[data-ifv-reskin][data-ifv-theme="dark"] .content__header,
html[data-ifv-reskin][data-ifv-theme="dark"] .content__header *,
html[data-ifv-reskin][data-ifv-theme="dark"] .grades__subject *,
html[data-ifv-reskin][data-ifv-theme="dark"] .grades__button *,
html[data-ifv-reskin][data-ifv-theme="dark"] .frekwencja-symbol__nazwa,
html[data-ifv-reskin][data-ifv-theme="dark"] .first-header__date-selector,
html[data-ifv-reskin][data-ifv-theme="dark"] .month-selector,
html[data-ifv-reskin][data-ifv-theme="dark"] .selectedtab,
html[data-ifv-reskin][data-ifv-theme="dark"] .MuiTab-wrapper {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .content__header__info-subheader,
html[data-ifv-reskin][data-ifv-theme="dark"] .position__lesson__hours,
html[data-ifv-reskin][data-ifv-theme="dark"] .app-footer,
html[data-ifv-reskin][data-ifv-theme="dark"] .app-footer a,
html[data-ifv-reskin][data-ifv-theme="dark"] .app-footer span {
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .tile__teachers__item,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__teachers__info,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__teacher__name,
html[data-ifv-reskin][data-ifv-theme="dark"] .tile__teacher__name * {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .tile__teacher__type {
    color: var(--ifv-text-2) !important;
}

/* scheduler / calendar (sprawdziany, zebrania): black ink on the grid */
html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple,
html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple *,
html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple__header-cell,
html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple-cell__number,
html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple-cell__container {
    color: var(--ifv-text) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple-cell--disabled,
html[data-ifv-reskin][data-ifv-theme="dark"] .scheduler-simple-cell--disabled * {
    color: var(--ifv-text-3) !important;
}

/* segmented tabs (frekwencja / plan) */
html[data-ifv-reskin][data-ifv-theme="dark"] .attendance-tabs button,
html[data-ifv-reskin][data-ifv-theme="dark"] .attendance-tabs button * {
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin][data-ifv-theme="dark"] .attendance-tabs button.Mui-selected,
html[data-ifv-reskin][data-ifv-theme="dark"] .attendance-tabs button.Mui-selected *,
html[data-ifv-reskin][data-ifv-theme="dark"] .attendance-tabs button:disabled,
html[data-ifv-reskin][data-ifv-theme="dark"] .attendance-tabs button:disabled * {
    color: var(--ifv-accent-text) !important;
    opacity: 1 !important;
}

/* ---------------------------------------------------- Plan zajęć --- */
/* The native weekly timetable is an absolutely-positioned grid of day
   columns. JS rebuilds every .plan-position cell into a clean, tappable
   lesson card (.ifv-lesson) and hides the app's own absolutely-positioned
   internals. The mobile "Resigned timetable" patch instead renders a
   .timetable / .lesson tree, which is rebuilt into .ifv-tl__card the same way. */
html[data-ifv-reskin] .timetable__grid {
    background: transparent !important;
    padding-left: 0 !important;
    gap: 6px !important;
}

/* ---- day headers (only rendered on wider viewports) ---- */
html[data-ifv-reskin] .column__header:has(h2) {
    height: auto !important;
    min-height: 50px !important;
    display: flex !important;
    align-items: center;
    justify-content: center;
    padding: 8px 4px !important;
}

html[data-ifv-reskin] .column__header h2 {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin: 0 !important;
    font-size: inherit !important;
    line-height: 1.1;
}

html[data-ifv-reskin] .day__number {
    font-size: 19px;
    font-weight: 700;
    line-height: 1;
    color: var(--ifv-text);
}

html[data-ifv-reskin] .day__name {
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ifv-text-3);
    text-align: center;
}

html[data-ifv-reskin] .column.current .day__number {
    color: var(--ifv-accent-text);
}

/* ---- lesson cell ---- */
html[data-ifv-reskin] .cell.cell--single {
    background: transparent !important;
}

html[data-ifv-reskin] .plan-position {
    display: flex !important;
    flex-direction: column !important;
    background: var(--ifv-surface) !important;
    border-radius: var(--ifv-radius-sm) !important;
    box-shadow: var(--ifv-shadow-sm) !important;
    overflow: hidden !important;
    transition: transform 0.12s var(--ifv-ease), background-color 0.15s var(--ifv-ease) !important;
}

html[data-ifv-reskin] .plan-position::before {
    display: none !important;
}

html[data-ifv-reskin] .plan-position:active {
    transform: scale(0.98) !important;
    background: var(--ifv-surface-2) !important;
}

html[data-ifv-reskin] .plan-position.zrealizowane {
    background: var(--ifv-surface-2) !important;
    box-shadow: none !important;
}

html[data-ifv-reskin] .plan-position.odwolane {
    box-shadow: var(--ifv-shadow-sm), inset 3px 0 0 #ef4444 !important;
}

html[data-ifv-reskin] .plan-position:has(.zastepstwo) {
    box-shadow: var(--ifv-shadow-sm), inset 3px 0 0 #f59e0b !important;
}

/* hide the app's absolute-positioned internals - JS rebuilds them */
html[data-ifv-reskin] .plan-position > .position__lesson__hours,
html[data-ifv-reskin] .plan-position > .plan-position__lesson,
html[data-ifv-reskin] .plan-position > .plan-position__adnotations,
html[data-ifv-reskin] .plan-position > .details-btn--appearance {
    display: none !important;
}

/* ---- rebuilt native lesson card ---- */
html[data-ifv-reskin] .ifv-lesson {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 9px 11px;
    overflow: hidden;
}

html[data-ifv-reskin] .ifv-lesson__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

html[data-ifv-reskin] .ifv-lesson__time {
    font-size: 11px;
    font-weight: 600;
    color: var(--ifv-text-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

html[data-ifv-reskin] .ifv-lesson__room {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--ifv-text-3);
    background: var(--ifv-surface-2);
    border-radius: 6px;
    padding: 1px 6px;
    white-space: nowrap;
}

html[data-ifv-reskin] .plan-position.zrealizowane .ifv-lesson__room {
    background: var(--ifv-surface-3);
}

html[data-ifv-reskin] .ifv-lesson__subject {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
}

html[data-ifv-reskin] .ifv-lesson__subject-text {
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--ifv-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

html[data-ifv-reskin] .ifv-lesson__group {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 600;
    color: var(--ifv-text-2);
    background: var(--ifv-surface-3);
    border-radius: 5px;
    padding: 1px 5px;
}

html[data-ifv-reskin] .ifv-lesson__teacher {
    font-size: 11px;
    color: var(--ifv-text-3);
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-lesson__chip {
    align-self: flex-start;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 6px;
    padding: 2px 7px;
    color: var(--ifv-text-2);
    background: var(--ifv-surface-3);
}

html[data-ifv-reskin] .ifv-lesson__chip--canceled {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.14);
}

html[data-ifv-reskin] .ifv-lesson__chip--substitute {
    color: #b45309;
    background: rgba(245, 158, 11, 0.16);
}

html[data-ifv-reskin] .ifv-lesson--canceled .ifv-lesson__subject-text {
    text-decoration: line-through;
    color: var(--ifv-text-3);
}

/* narrow desktop columns need a denser card */
@media (min-width: 1024px) {
    html[data-ifv-reskin] .ifv-lesson {
        padding: 7px 9px;
        gap: 2px;
    }

    html[data-ifv-reskin] .ifv-lesson__subject-text {
        font-size: 12px;
        -webkit-line-clamp: 3;
    }

    html[data-ifv-reskin] .ifv-lesson__teacher {
        font-size: 10px;
    }
}

/* ---- custom mobile timetable (patch "Resigned timetable") ---- */
html[data-ifv-reskin] .timetable {
    display: block !important;
    height: auto !important;
    margin: 0 !important;
    padding: 6px 12px 16px !important;
}

html[data-ifv-reskin] .timetable .lesson {
    display: flex !important;
    align-items: stretch !important;
    gap: 10px !important;
    height: auto !important;
    margin: 0 0 8px !important;
    line-height: 1.2 !important;
}

html[data-ifv-reskin] .timetable .lesson > .ifv-tl__slot {
    display: flex !important;
    flex: 0 0 42px !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 1px !important;
    color: var(--ifv-text-3) !important;
}

html[data-ifv-reskin] .timetable .lesson > .ifv-tl__card {
    display: flex !important;
    flex: 1 1 auto !important;
    align-items: center !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 11px 13px !important;
    background: var(--ifv-surface) !important;
    border-radius: var(--ifv-radius-sm) !important;
    box-shadow: var(--ifv-shadow-sm) !important;
    overflow: hidden !important;
    transition: transform 0.12s var(--ifv-ease), background-color 0.15s var(--ifv-ease) !important;
}

html[data-ifv-reskin] .timetable .lesson:active > .ifv-tl__card {
    transform: scale(0.99) !important;
    background: var(--ifv-surface-2) !important;
}

html[data-ifv-reskin] .ifv-tl__no {
    font-size: 20px !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    color: var(--ifv-text-2) !important;
}

html[data-ifv-reskin] .ifv-tl__time {
    font-size: 10px !important;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

html[data-ifv-reskin] .ifv-tl__body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

html[data-ifv-reskin] .ifv-tl__subject {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: var(--ifv-text) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-tl__meta {
    font-size: 11px !important;
    color: var(--ifv-text-3) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-tl__chip {
    flex: 0 0 auto;
    align-self: center;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 6px;
    padding: 3px 7px;
    color: var(--ifv-text-2);
    background: var(--ifv-surface-3);
}

html[data-ifv-reskin] .lesson.canceled > .ifv-tl__slot {
    opacity: 0.6;
}

html[data-ifv-reskin] .lesson.canceled .ifv-tl__subject {
    text-decoration: line-through;
    color: var(--ifv-text-3) !important;
}

html[data-ifv-reskin] .lesson.canceled .ifv-tl__chip {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.14);
}

html[data-ifv-reskin] .lesson.substitute .ifv-tl__chip {
    color: #b45309;
    background: rgba(245, 158, 11, 0.16);
}

html[data-ifv-reskin] .lesson.canceled > .ifv-tl__card {
    box-shadow: var(--ifv-shadow-sm), inset 3px 0 0 #ef4444 !important;
}

html[data-ifv-reskin] .lesson.substitute > .ifv-tl__card {
    box-shadow: var(--ifv-shadow-sm), inset 3px 0 0 #f59e0b !important;
}

html[data-ifv-reskin] .timetable > div > .no-lessons-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ifv-text-2);
}

/* Month selector */
html[data-ifv-reskin] .first-header__date-selector {
    padding: 12px 12px 8px !important;
    margin: 0 12px !important;
    background: transparent !important;
    border-radius: 0 !important;
    box-shadow: none !important;
}

html[data-ifv-reskin] .month-selector {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
}

html[data-ifv-reskin] .month-selector button {
    min-width: 40px !important;
    min-height: 40px !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--ifv-text-2) !important;
    border: 1px solid var(--ifv-line) !important;
    transition: background-color 0.15s var(--ifv-ease), color 0.15s var(--ifv-ease), border-color 0.15s var(--ifv-ease) !important;
}

html[data-ifv-reskin] .month-selector button:hover,
html[data-ifv-reskin] .month-selector button:active {
    background: var(--ifv-surface-2) !important;
    color: var(--ifv-text) !important;
    border-color: var(--ifv-accent) !important;
}

/* Day headers in column content */
html[data-ifv-reskin] .column__content > div:first-child {
    padding-top: 12px !important;
}

/* ---------------------------------------------------- Frekwencja --- */
/* Frekwencja | Statystyki — rewritten from scratch.
   The app injects a \`position:fixed; width:100vw; transform:translateX(-5px)\`
   bar with two decorative strip <div>s, and swaps the two views with broken
   structural selectors that leave the attendance view stacked above the
   statistics view. We render a plain, in-flow segmented control and drive the
   pane switch off the \`stats\` class the app already toggles. */
html[data-ifv-reskin] .attendance-tabs {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    width: auto !important;
    height: auto !important;
    transform: none !important;
    z-index: 30 !important;
    display: flex !important;
    gap: 4px !important;
    margin: 4px 12px 10px !important;
    padding: 4px !important;
    background: var(--ifv-surface-3) !important;
    border-radius: 12px !important;
    box-shadow: var(--ifv-shadow-sm) !important;
}

/* decorative strip children shipped by the app */
html[data-ifv-reskin] .attendance-tabs > div {
    display: none !important;
}

html[data-ifv-reskin] .attendance-tabs > button {
    flex: 1 1 0 !important;
    width: auto !important;
    height: 40px !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: 9px !important;
    background: transparent !important;
    color: var(--ifv-text-2) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    opacity: 1 !important;
    cursor: pointer !important;
    transition: background-color 0.18s var(--ifv-ease),
        color 0.18s var(--ifv-ease) !important;
}

/* the button of the currently shown view is the disabled one */
html[data-ifv-reskin] .attendance-tabs > button:disabled {
    background: var(--ifv-surface) !important;
    color: var(--ifv-accent) !important;
    box-shadow: var(--ifv-shadow-sm) !important;
}

/* Pane switch: exactly one of the two sibling views is visible. */
html[data-ifv-reskin]
    .app__content:has(.tabsview.attendance-init.stats)
    .tabsview.attendance-init.stats {
    display: none !important;
}

html[data-ifv-reskin]
    .app__content:has(.tabsview.attendance-init:not(.stats))
    .mobile__frame:has(.statistics) {
    display: none !important;
}

/* Attendance list container */
html[data-ifv-reskin] .frequency-position__bg {
    background: transparent !important;
    margin: 8px 12px !important;
    border-radius: var(--ifv-radius) !important;
    box-shadow: var(--ifv-shadow) !important;
    overflow: hidden;
}

html[data-ifv-reskin] .frequency-position__one-item {
    background: var(--ifv-surface) !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    padding: 12px 16px !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
}

html[data-ifv-reskin] .frequency-position__one-item:last-child {
    border-bottom: 0 !important;
}

html[data-ifv-reskin] .frequency-position__one-item:active {
    background: var(--ifv-surface-2) !important;
}

/* Attendance item layout: time | subject+teacher | status */
html[data-ifv-reskin] .frequency-position__one-item > .position__lesson__hours {
    flex: 0 0 70px !important;
    color: var(--ifv-text-2) !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    white-space: nowrap;
    text-align: right;
    padding-right: 12px !important;
}

html[data-ifv-reskin] .frequency-position__one-item > div:not(.position__lesson__hours) {
    flex: 1 !important;
    min-width: 0;
}

html[data-ifv-reskin] .frequency-position__one-item .position__lesson__subject {
    color: var(--ifv-text) !important;
    font-weight: 600 !important;
    font-size: 14px !important;
    margin-bottom: 2px !important;
}

html[data-ifv-reskin] .frequency-position__one-item .position__lesson__teacher {
    color: var(--ifv-text-3) !important;
    font-size: 12px !important;
}

/* Attendance status chips */
html[data-ifv-reskin] .frequency-position__one-item .obecnosc,
html[data-ifv-reskin] .frequency-position__one-item .usprawiedliwione,
html[data-ifv-reskin] .frequency-position__one-item .nieobecnosc,
html[data-ifv-reskin] .frequency-position__one-item .spoznienie,
html[data-ifv-reskin] .frequency-position__one-item .nieobecnyZPrzyczynSzkolnych,
html[data-ifv-reskin] .frequency-position__one-item .zwolnienie {
    flex: 0 0 auto !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 4px 10px !important;
    border-radius: var(--ifv-radius-xs) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.02em;
    white-space: nowrap;
    margin-left: auto !important;
}

html[data-ifv-reskin] .frequency-position__one-item .obecnosc,
html[data-ifv-reskin] .frequency-position__one-item .usprawiedliwione {
    background: rgba(16, 185, 129, 0.15) !important;
    color: #10b981 !important;
}

html[data-ifv-reskin] .frequency-position__one-item .nieobecnosc {
    background: rgba(239, 68, 68, 0.15) !important;
    color: #ef4444 !important;
}

html[data-ifv-reskin] .frequency-position__one-item .spoznienie {
    background: rgba(245, 158, 11, 0.15) !important;
    color: #f59e0b !important;
}

html[data-ifv-reskin] .frequency-position__one-item .nieobecnyZPrzyczynSzkolnych,
html[data-ifv-reskin] .frequency-position__one-item .zwolnienie {
    background: rgba(148, 163, 184, 0.15) !important;
    color: #94a3b8 !important;
}

/* Attendance rebuilt as plan-style cards (no hour grid) */
html[data-ifv-reskin] .frekwencja .timetable__grid,
html[data-ifv-reskin] .frekwencja .background,
html[data-ifv-reskin] .frekwencja .timetable,
html[data-ifv-reskin] .frekwencja > section {
    display: none !important;
}

html[data-ifv-reskin] .ifv-attendance {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
}

html[data-ifv-reskin] .ifv-attendance > .ifv-lesson {
    margin: 0;
    padding: 11px 13px;
    background: var(--ifv-surface);
    border-radius: var(--ifv-radius-sm);
    box-shadow: var(--ifv-shadow-sm);
    transition: transform 0.12s var(--ifv-ease),
        background-color 0.15s var(--ifv-ease);
}

html[data-ifv-reskin] .ifv-attendance > .ifv-lesson:active {
    transform: scale(0.99);
    background: var(--ifv-surface-2);
}

html[data-ifv-reskin] .ifv-empty {
    text-align: center;
    color: var(--ifv-text-3);
    font-size: 14px;
    font-weight: 600;
    padding: 28px 12px;
}

html[data-ifv-reskin] .ifv-lesson__chip--ok {
    color: #10b981 !important;
    background: rgba(16, 185, 129, 0.15) !important;
}

html[data-ifv-reskin] .ifv-lesson__chip--bad {
    color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.15) !important;
}

html[data-ifv-reskin] .ifv-lesson__chip--warn {
    color: #f59e0b !important;
    background: rgba(245, 158, 11, 0.15) !important;
}

html[data-ifv-reskin] .ifv-lesson__chip--info {
    color: #94a3b8 !important;
    background: rgba(148, 163, 184, 0.15) !important;
}

/* Statistics cards */
html[data-ifv-reskin] .statistics .content__header {
    padding: 12px 16px !important;
    background: var(--ifv-surface) !important;
    border-radius: var(--ifv-radius) var(--ifv-radius) 0 0 !important;
    border-bottom: 1px solid var(--ifv-line) !important;
}

html[data-ifv-reskin] .statistics .content__header__info-big {
    font-size: 18px !important;
}

html[data-ifv-reskin] .statistics > div:not(.content__header) {
    background: var(--ifv-surface) !important;
    border-radius: 0 0 var(--ifv-radius) var(--ifv-radius) !important;
    box-shadow: var(--ifv-shadow) !important;
    margin: 0 12px 12px !important;
    padding: 12px 16px !important;
}

/* ---------------------------------------------------- Oceny: section pager --- */
/* The expandable accordion headers are replaced by a top pager (prev/next). */
html[data-ifv-reskin] .MuiAccordion-root[data-ifv-oceny] {
    margin: 0 12px 10px !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-oceny]
    > .MuiAccordionSummary-root {
    display: none !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-oceny]
    .MuiAccordionDetails-root {
    padding: 14px 16px 16px !important;
}

/* No expand/collapse animation — instant swap between sections. */
html[data-ifv-reskin] .MuiAccordion-root[data-ifv-oceny] .MuiCollapse-root,
html[data-ifv-reskin] .MuiAccordion-root[data-ifv-oceny] .MuiCollapse-wrapper,
html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-oceny]
    .MuiCollapse-wrapperInner,
html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-oceny]
    .MuiAccordionDetails-root {
    transition: none !important;
    animation: none !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-oceny]:not(.Mui-expanded)
    .MuiCollapse-root {
    display: none !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-oceny].Mui-expanded
    .MuiCollapse-root {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
    visibility: visible !important;
}

html[data-ifv-reskin] .ifv-oceny-pager {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 12px 12px;
    padding: 6px;
    border-radius: var(--ifv-radius-sm);
    background: var(--ifv-surface-2);
    border: 1px solid var(--ifv-line);
}

html[data-ifv-reskin] .ifv-oceny-pager__arrow {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--ifv-radius-xs);
    background: transparent;
    color: var(--ifv-text-2);
    cursor: pointer;
    transition:
        background-color 0.16s var(--ifv-ease),
        color 0.16s var(--ifv-ease),
        transform 0.12s var(--ifv-ease);
}

html[data-ifv-reskin] .ifv-oceny-pager__arrow:hover {
    background: var(--ifv-surface-3);
    color: var(--ifv-text);
}

html[data-ifv-reskin] .ifv-oceny-pager__arrow:active {
    transform: scale(0.92);
}

html[data-ifv-reskin] .ifv-oceny-pager__arrow svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
}

html[data-ifv-reskin] .ifv-oceny-pager__label {
    flex: 1 1 auto;
    min-width: 0;
    text-align: center;
    line-height: 1.2;
}

html[data-ifv-reskin] .ifv-oceny-pager__title {
    display: block;
    font-size: 16px;
    font-weight: 700;
    color: var(--ifv-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html[data-ifv-reskin] .ifv-oceny-pager__count {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--ifv-text-3);
    text-transform: uppercase;
}

/* ------------------------------------------------- Attendance day navbar --- */
html[data-ifv-reskin] .MuiAccordion-root[data-ifv-att] {
    margin: 0 12px 10px !important;
    box-shadow: none !important;
    border-radius: var(--ifv-radius) !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-att]
    > .MuiAccordionSummary-root {
    display: none !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-att]
    .MuiAccordionDetails-root {
    padding: 0 !important;
}

/* No expand/collapse animation — instant swap between days. */
html[data-ifv-reskin] .MuiAccordion-root[data-ifv-att] .MuiCollapse-root,
html[data-ifv-reskin] .MuiAccordion-root[data-ifv-att] .MuiCollapse-wrapper,
html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-att]
    .MuiCollapse-wrapperInner,
html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-att]
    .MuiAccordionDetails-root {
    transition: none !important;
    animation: none !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-att]:not(.Mui-expanded)
    .MuiCollapse-root {
    display: none !important;
}

html[data-ifv-reskin]
    .MuiAccordion-root[data-ifv-att].Mui-expanded
    .MuiCollapse-root {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
    visibility: visible !important;
}

html[data-ifv-reskin] .ifv-att-nav {
    margin: 4px 12px 10px;
    padding: 6px;
    border-radius: var(--ifv-radius);
    background: var(--ifv-surface-2);
    border: 1px solid var(--ifv-line);
}

/* The day picker and its week arrows are the only date navigation on the
   mobile weekly accordion view — hide the app's own week selector there.
   Keyed off the mobile frame (not the accordion tags) so it never flashes
   back while a week switch re-renders the accordions. */
html[data-ifv-reskin]
    .mobile__frame .tabsview.attendance-init .week-selector {
    display: none !important;
}

html[data-ifv-reskin] .ifv-att-nav__range {
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    letter-spacing: 0.03em;
    color: var(--ifv-text-2);
    padding: 2px 4px 8px;
    border-bottom: 1px solid var(--ifv-line);
    margin-bottom: 6px;
}

html[data-ifv-reskin] .ifv-att-nav__row {
    display: flex;
    align-items: center;
    gap: 4px;
}

html[data-ifv-reskin] .ifv-att-nav__days {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
}

html[data-ifv-reskin] .ifv-att-nav__days::-webkit-scrollbar {
    display: none;
}

html[data-ifv-reskin] .ifv-att-nav__day {
    flex: 1 1 0;
    min-width: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 6px 4px;
    border: 0;
    border-radius: var(--ifv-radius-xs);
    background: transparent;
    color: var(--ifv-text-2);
    cursor: pointer;
    transition: background-color 0.16s var(--ifv-ease),
        color 0.16s var(--ifv-ease);
}

html[data-ifv-reskin] .ifv-att-nav__day:hover {
    background: var(--ifv-surface-3);
}

html[data-ifv-reskin] .ifv-att-nav__day.is-active {
    background: var(--ifv-accent-soft);
    color: var(--ifv-accent-text);
}

html[data-ifv-reskin] .ifv-att-nav__weekday {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: nowrap;
}

html[data-ifv-reskin] .ifv-att-nav__date {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

/* ---------------------------------------------------- Global touch targets --- */
html[data-ifv-reskin] button,
html[data-ifv-reskin] a[role="button"],
html[data-ifv-reskin] .MuiButtonBase-root,
html[data-ifv-reskin] .MuiIconButton-root {
    min-height: 44px !important;
    min-width: 44px !important;
}

html[data-ifv-reskin] .MuiIconButton-root {
    padding: 8px !important;
}

/* Smooth scrolling */
html[data-ifv-reskin] {
    scroll-behavior: smooth;
}

/* Focus visible for accessibility */
html[data-ifv-reskin] *:focus-visible {
    outline: 2px solid var(--ifv-accent) !important;
    outline-offset: 2px !important;
    border-radius: var(--ifv-radius-xs) !important;
}

@media (prefers-reduced-motion: reduce) {
    html[data-ifv-reskin] * {
        transition-duration: 0.001ms !important;
        animation-duration: 0.001ms !important;
    }
}

/* ============================================================ flat pass ===
   Remove nested "box" chrome so content shows directly on the card surface.
   Placed last (and scoped with [data-ifv-theme]) so it also wins in dark. */
html[data-ifv-reskin][data-ifv-theme] .content-container,
html[data-ifv-reskin][data-ifv-theme] .tile__header,
html[data-ifv-reskin][data-ifv-theme] .tile__grades,
html[data-ifv-reskin][data-ifv-theme] .tile__empty-bg,
html[data-ifv-reskin][data-ifv-theme] .tile__empty-container,
html[data-ifv-reskin][data-ifv-theme] .tile-with-boxes .tile__content,
html[data-ifv-reskin][data-ifv-theme] .grades__box,
html[data-ifv-reskin][data-ifv-theme] .app-footer__row {
    background-color: transparent !important;
    background-image: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
}

html[data-ifv-reskin][data-ifv-theme] .app-footer__row {
    border-bottom: 1px solid var(--ifv-line) !important;
}

/* Accordion (Oceny) content: drop the inner container padding so grades sit
   flush on the section card. */
html[data-ifv-reskin][data-ifv-theme]
    .MuiAccordionDetails-root
    .content-container {
    margin: 0 !important;
    padding: 0 !important;
}

/* Grade rows: flat with divider lines only. */
html[data-ifv-reskin][data-ifv-theme] .grades__subject {
    background-color: transparent !important;
    border-bottom: 1px solid var(--ifv-line) !important;
    border-top: 0 !important;
    border-left: 0 !important;
    border-right: 0 !important;
    border-radius: 0 !important;
    margin-bottom: 0 !important;
    padding: 10px 12px !important;
    box-shadow: none !important;
}

html[data-ifv-reskin][data-ifv-theme] .grades__subject:last-child {
    border-bottom: 0 !important;
}

/* Stray hardcoded ink on wrappers (e.g. Zebrania notes). */
html[data-ifv-reskin][data-ifv-theme] .note {
    color: var(--ifv-text) !important;
}

/* Fully flat: card surfaces (tiles, boxes, sections, lessons) lose their
   background/border too — content sits on the page surface directly. */
html[data-ifv-reskin][data-ifv-theme] .tile,
html[data-ifv-reskin][data-ifv-theme] .box,
html[data-ifv-reskin][data-ifv-theme] .MuiAccordion-root,
html[data-ifv-reskin][data-ifv-theme] .MuiAccordion-root.Mui-expanded {
    background-color: transparent !important;
    background-image: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
}

html[data-ifv-reskin][data-ifv-theme] .plan-position::before {
    display: none !important;
}

html[data-ifv-reskin][data-ifv-theme] .tile:active {
    box-shadow: none !important;
    background-color: var(--ifv-surface-2) !important;
}

html[data-ifv-reskin][data-ifv-theme] .first-header__date-selector {
    background-color: transparent !important;
    background-image: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
}

/* ------------------------------------------------- Frekwencja: flat tab ---
   No nested "box" around the day picker and the lesson list — they sit
   directly on the tab surface, like Plan lekcji. */
html[data-ifv-reskin][data-ifv-theme] .MuiAccordion-root[data-ifv-att] {
    margin: 0 !important;
}

html[data-ifv-reskin][data-ifv-theme]
    .MuiAccordion-root[data-ifv-att]
    .frekwencja {
    margin: 0 !important;
}

html[data-ifv-reskin][data-ifv-theme] .ifv-attendance {
    padding: 0 0 8px !important;
}

html[data-ifv-reskin][data-ifv-theme] .ifv-att-nav {
    background: transparent !important;
    background-image: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    margin: 0 0 10px !important;
    padding: 0 !important;
}
`,

        /* IFV-RESKIN-CSS:END */
    };

    const CSS_EXTRA = `
.patch-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.patch-title-row .patch-name {
    margin: 0;
}

.category-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 15px;
}

.category-bar select {
    flex: 1;
    background-color: #ecedf7;
    border: 1px solid #ecedf7;
    border-radius: 20px;
    padding: 0 12px;
    height: 40px;
    font-size: 14px;
    color: #202022;
    cursor: pointer;
}

.category-bar .toggle-all-button {
    background-color: #ecedf7;
    border: 1px solid #ecedf7;
    border-radius: 20px;
    padding: 0 16px;
    font-size: 14px;
    color: #202022;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
}

.category-bar .toggle-all-button:hover {
    background-color: #dde2f2;
}

.patches-list .patch.mobileOnly {
    border-left: 3px solid #007bff;
}

.patches-list .patch.desktopOnly {
    border-left: 3px solid #16a34a;
}

@media (max-width: 500px) {
    .ifv-patches-modal {
        width: 95% !important;
    }
}
`;

    const RESKIN_PATCH_NAME = "Nowy wygląd (reskin)";
    const RESKIN_ICONS = {
        tablica: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
        oceny: "M3 5h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3z",
        frekwencja: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
        planZajec:
            "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V10h14zM5 8V6h14v2z",
        more: "M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4m6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4m6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4",
    };
    const RESKIN_THEME_ICONS = {
        light: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0-5h0v3h0zm0 14v3h0zM4.2 4.2l2.1 2.1 1.4-1.4-2.1-2.1zM18.3 4.2l-2.1 2.1 1.4 1.4 2.1-2.1zM2 11h3v2H2zm17 0h3v2h-3zM4.2 19.8l2.1-2.1 1.4 1.4-2.1 2.1zM18.3 19.8l-2.1-2.1 1.4-1.4 2.1 2.1z",
        dark: "M12 3a9 9 0 1 0 9 9c0-.5-.04-1-.12-1.48A5.5 5.5 0 0 1 12 4.5c0-.5.06-.99.19-1.46A9 9 0 0 0 12 3",
        auto: "M12 4a8 8 0 1 0 0 16zM12 6v12a6 6 0 0 0 0-12",
    };

    const hexToRgb = (hex) => {
        const clean = String(hex).replace("#", "").trim();
        const full =
            clean.length === 3
                ? clean
                      .split("")
                      .map((c) => c + c)
                      .join("")
                : clean;
        const n = parseInt(full || "4f46e5", 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };

    const resolveReskinTheme = () => {
        const choice = getSetting(RESKIN_PATCH_NAME, "theme") || "auto";
        if (choice === "light" || choice === "dark") return choice;
        return W.matchMedia &&
            W.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    };

    const applyReskinTheme = () => {
        const html = document.documentElement;
        html.setAttribute("data-ifv-reskin", "");
        const resolved = resolveReskinTheme();
        html.setAttribute("data-ifv-theme", resolved);
        const baseAccent = getSetting(RESKIN_PATCH_NAME, "accent") || "#6366f1";
        const mix = (hex, amt) => {
            const { r, g, b } = hexToRgb(hex);
            const f = (v) => Math.round(v + (255 - v) * amt);
            return { r: f(r), g: f(g), b: f(b) };
        };
        const accentRgb =
            resolved === "dark" ? mix(baseAccent, 0.32) : hexToRgb(baseAccent);
        const textRgb =
            resolved === "dark" ? mix(baseAccent, 0.5) : hexToRgb(baseAccent);
        html.style.setProperty(
            "--ifv-accent",
            `rgb(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b})`,
        );
        html.style.setProperty(
            "--ifv-accent-soft",
            `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${resolved === "dark" ? 0.22 : 0.12})`,
        );
        html.style.setProperty(
            "--ifv-accent-text",
            `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`,
        );
        html.style.setProperty(
            "--ifv-accent-contrast",
            resolved === "dark" ? "#0d0f14" : "#ffffff",
        );
        const toggle = document.querySelector(".ifv-theme-toggle");
        if (toggle) {
            const choice = getSetting(RESKIN_PATCH_NAME, "theme") || "auto";
            const path =
                RESKIN_THEME_ICONS[choice] || RESKIN_THEME_ICONS.auto;
            toggle.innerHTML = `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
        }
    };

    const cycleReskinTheme = () => {
        const order = ["auto", "light", "dark"];
        const current = getSetting(RESKIN_PATCH_NAME, "theme") || "auto";
        const next = order[(order.indexOf(current) + 1) % order.length];
        saveSetting(RESKIN_PATCH_NAME, "theme", next);
        applyReskinTheme();
    };

    const addReskinThemeToggle = () => {
        if (document.querySelector(".ifv-theme-toggle")) return;
        const target =
            document.querySelector(".header__tools") ||
            document.querySelector(".header_logo_tools-container");
        if (!target) return;
        const button = document.createElement("button");
        button.className = "ifv-theme-toggle";
        button.type = "button";
        button.title = "Motyw: jasny / ciemny / automatyczny";
        button.style.marginLeft = "auto";
        button.addEventListener("click", cycleReskinTheme);
        target.appendChild(button);
        applyReskinTheme();
    };

    const decorateReskinNav = () => {
        const nav = document.querySelector(".bottom-navigation-bar");
        if (!nav || nav.getAttribute("data-ifv-nav") === "1") return;
        const order = ["tablica", "oceny", "frekwencja", "planZajec", "more"];
        Array.from(nav.children).forEach((item, index) => {
            const holder =
                item.querySelector("div:has(img)") ||
                item.firstElementChild;
            if (!holder) return;
            const key = order[index];
            holder.classList.add("ifv-nav-ico");
            if (key && RESKIN_ICONS[key]) {
                holder.innerHTML = `<svg viewBox="0 0 24 24"><path d="${RESKIN_ICONS[key]}"/></svg>`;
            }
        });
        nav.setAttribute("data-ifv-nav", "1");
    };

    const refreshReskinNavActive = () => {
        const nav = document.querySelector(".bottom-navigation-bar");
        if (!nav) return;
        const order = ["tablica", "oceny", "frekwencja", "planZajec"];
        const path = W.location.pathname;
        let activeIndex = -1;
        order.forEach((key, i) => {
            if (path.endsWith(key)) activeIndex = i;
        });
        const moreOpen = document
            .querySelector(".more-popup")
            ?.style?.display === "block";
        Array.from(nav.children).forEach((item, index) => {
            const isActive =
                index === 4 ? moreOpen : index === activeIndex;
            item.classList.toggle("ifv-nav-active", isActive);
        });
    };

    const syncReskinMetrics = () => {
        const header = document.querySelector("header.app__header");
        if (header) {
            const h = Math.round(header.getBoundingClientRect().height);
            if (h > 0)
                document.documentElement.style.setProperty(
                    "--ifv-header-h",
                    h + "px",
                );
        }
    };

    const RESKIN_CHEVRON = {
        prev: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
        next: "M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z",
    };

    const ocenySectionLabel = (accordion) =>
        (
            accordion.querySelector(".MuiAccordionSummary-content")
                ?.textContent || ""
        )
            .replace(/\s+/g, " ")
            .trim();

    const mountOcenyPager = () => {
        if (!isMobileView()) return;
        if (!/(^|\/)oceny(\/|$|\?|#)/.test(W.location.pathname)) return;

        const build = () => {
            const accordions = Array.from(
                document.querySelectorAll(".MuiAccordion-root"),
            );
            if (accordions.length < 2) return false;
            const parent = accordions[0].parentElement;
            if (!parent) return false;
            if (parent.querySelector(":scope > .ifv-oceny-pager")) return true;

            accordions.forEach((a) =>
                a.setAttribute("data-ifv-oceny", "1"),
            );

            const bar = document.createElement("div");
            bar.className = "ifv-oceny-pager";
            bar.setAttribute("data-ifv-oceny", "1");
            bar.innerHTML =
                `<button type="button" class="ifv-oceny-pager__arrow" data-ifv-dir="-1" aria-label="Poprzedni">` +
                `<svg viewBox="0 0 24 24"><path d="${RESKIN_CHEVRON.prev}"/></svg></button>` +
                `<div class="ifv-oceny-pager__label">` +
                `<span class="ifv-oceny-pager__title"></span>` +
                `<span class="ifv-oceny-pager__count"></span>` +
                `</div>` +
                `<button type="button" class="ifv-oceny-pager__arrow" data-ifv-dir="1" aria-label="Następny">` +
                `<svg viewBox="0 0 24 24"><path d="${RESKIN_CHEVRON.next}"/></svg></button>`;

            const titleEl = bar.querySelector(".ifv-oceny-pager__title");
            const countEl = bar.querySelector(".ifv-oceny-pager__count");

            const list = () =>
                Array.from(
                    document.querySelectorAll(
                        ".MuiAccordion-root[data-ifv-oceny]",
                    ),
                );
            const isExpanded = (a) =>
                a.className.toString().indexOf("Mui-expanded") !== -1;
            const activeIndex = () => {
                const i = list().findIndex(isExpanded);
                return i < 0 ? 0 : i;
            };

            const render = () => {
                const sections = list();
                if (!sections.length) return;
                const idx = activeIndex();
                const title =
                    ocenySectionLabel(sections[idx]) || "Okres";
                const count = `${idx + 1} / ${sections.length}`;
                if (titleEl.textContent !== title) titleEl.textContent = title;
                if (countEl.textContent !== count) countEl.textContent = count;
            };

            const goTo = (target) => {
                const sections = list();
                if (!sections.length) return;
                const total = sections.length;
                const idx = ((target % total) + total) % total;
                sections.forEach((a, i) => {
                    if ((i === idx) === isExpanded(a)) return;
                    a.querySelector(".MuiAccordionSummary-root")?.click();
                });
                requestAnimationFrame(render);
                setTimeout(render, 140);
            };

            bar.addEventListener("click", (event) => {
                const arrow = event.target.closest(
                    ".ifv-oceny-pager__arrow",
                );
                if (!arrow) return;
                event.preventDefault();
                goTo(
                    activeIndex() +
                        (parseInt(arrow.getAttribute("data-ifv-dir"), 10) ||
                            0),
                );
            });

            parent.insertBefore(bar, accordions[0]);

            new MutationObserver(() => {
                if (bar.isConnected) render();
            }).observe(parent, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["class"],
            });

            render();
            return true;
        };

        if (!build()) {
            waitForRender(
                () =>
                    document.querySelectorAll(".MuiAccordion-root").length >=
                    2,
            ).then(build);
        }
    };

    const reskinEl = (tag, className, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined && text !== null) el.textContent = text;
        return el;
    };

    const reskinHours = (start, end) =>
        start && end
            ? `${start}\u2013${end}`
            : start || end || "";

    const buildReskinNativeCard = (pos) => {
        const data = normalizeLesson(pos);
        const sig = [
            data.type,
            data.startingHour,
            data.endingHour,
            data.subject,
            data.group,
            data.classroom,
            data.teacher,
            data.annotationText,
        ].join("|");
        const existing = pos.querySelector(":scope > .ifv-lesson");
        if (existing && pos.getAttribute("data-ifv-sig") === sig) return;

        const card = reskinEl("div", `ifv-lesson ifv-lesson--${data.type}`);

        const top = reskinEl("div", "ifv-lesson__top");
        const time = reskinHours(data.startingHour, data.endingHour);
        if (time) top.appendChild(reskinEl("span", "ifv-lesson__time", time));
        if (data.classroom)
            top.appendChild(reskinEl("span", "ifv-lesson__room", data.classroom));
        if (top.children.length) card.appendChild(top);

        if (data.subject) {
            const subject = reskinEl("div", "ifv-lesson__subject");
            subject.appendChild(
                reskinEl("span", "ifv-lesson__subject-text", data.subject),
            );
            if (data.group)
                subject.appendChild(
                    reskinEl("span", "ifv-lesson__group", data.group),
                );
            card.appendChild(subject);
        }

        if (data.teacher)
            card.appendChild(
                reskinEl("div", "ifv-lesson__teacher", data.teacher),
            );

        const chip =
            data.annotationText ||
            (data.type === "canceled"
                ? "Odwołane"
                : data.type === "substitute"
                  ? "Zastępstwo"
                  : "");
        if (chip)
            card.appendChild(
                reskinEl(
                    "span",
                    `ifv-lesson__chip ifv-lesson__chip--${data.type}`,
                    chip,
                ),
            );

        if (existing) existing.replaceWith(card);
        else pos.appendChild(card);
        pos.setAttribute("data-ifv-sig", sig);
    };

    const buildReskinCustomCard = (lesson) => {
        if (lesson.querySelector(":scope > .ifv-tl__card")) return;

        const slotNo =
            lesson.querySelector(":scope > div")?.textContent?.trim() || "";
        const info = lesson.querySelector(":scope > article > .info");
        const start = info?.children[0]?.textContent?.trim() || "";
        const end = info?.children[1]?.textContent?.trim() || "";
        const subject =
            lesson.querySelector(".data .subject")?.textContent?.trim() || "";
        const meta =
            lesson.querySelector(".data .additional-info")?.textContent?.trim() ||
            "";
        const type =
            ["conflicted", "substitute", "canceled"].find((t) =>
                lesson.classList.contains(t),
            ) ||
            (lesson.classList.contains("unknown") ? "unknown" : "normal");
        const chip =
            type === "canceled"
                ? "Odwołane"
                : type === "substitute"
                  ? "Zastępstwo"
                  : type === "conflicted"
                    ? "Więcej lekcji"
                    : "";

        const slot = reskinEl("div", "ifv-tl__slot");
        if (slotNo) slot.appendChild(reskinEl("span", "ifv-tl__no", slotNo));
        if (start)
            slot.appendChild(reskinEl("span", "ifv-tl__time", start));
        if (end) slot.appendChild(reskinEl("span", "ifv-tl__time", end));

        const card = reskinEl("article", "ifv-tl__card");
        const body = reskinEl("div", "ifv-tl__body");
        if (subject)
            body.appendChild(reskinEl("div", "ifv-tl__subject", subject));
        if (meta) body.appendChild(reskinEl("div", "ifv-tl__meta", meta));
        card.appendChild(body);
        if (chip) card.appendChild(reskinEl("span", "ifv-tl__chip", chip));

        lesson.innerHTML = "";
        lesson.appendChild(slot);
        lesson.appendChild(card);
    };

    const RESKIN_ATT_LABELS = {
        obecnosc: "Obecny",
        usprawiedliwione: "Usprawiedliwione",
        usprawiedliwienieZatwierdzone: "Usprawiedliwione",
        usprawiedliwienieNowe: "Usprawiedliwienie",
        nieobecnosc: "Nieobecny",
        nieobecnoscNieusprawiedliwiona: "Nieobecny",
        nieobecnoscUsprawiedliwiona: "Usprawiedliwiona",
        spoznienie: "Sp\u00f3\u017anienie",
        spoznienieUsprawiedliwione: "Sp\u00f3\u017anienie uspr.",
        nieobecnyZPrzyczynSzkolnych: "Obecno\u015b\u0107 szkolna",
        zwolniony: "Zwolnienie",
    };

    const RESKIN_ATT_CHIP = {
        obecnosc: "ok",
        usprawiedliwione: "info",
        usprawiedliwienieZatwierdzone: "info",
        usprawiedliwienieNowe: "info",
        nieobecnosc: "bad",
        nieobecnoscNieusprawiedliwiona: "bad",
        nieobecnoscUsprawiedliwiona: "info",
        spoznienie: "warn",
        spoznienieUsprawiedliwione: "warn",
        nieobecnyZPrzyczynSzkolnych: "info",
        zwolniony: "info",
    };

    const reskinAttStatus = (one) => {
        const sym = one.querySelector(".frekwencja-symbol");
        const candidates = [
            ...(sym ? sym.classList : one.classList),
            ...one.classList,
        ];
        return (
            candidates.find((c) => RESKIN_ATT_LABELS[c]) ||
            candidates.find((c) =>
                ["obecnosc", "nieobecnosc", "spoznienie", "zwolnienie"].includes(
                    c,
                ),
            ) ||
            ""
        );
    };

    const buildReskinAttendanceCard = (one) => {
        const status = reskinAttStatus(one);
        const sym = one.querySelector(".frekwencja-symbol");
        const timeRaw =
            one.querySelector(".position__lesson__hours")?.textContent?.trim() ||
            "";
        const [start, end] = timeRaw.split("-").map((s) => s.trim());
        const time = reskinHours(start, end);
        const subject =
            one.querySelector(".position__lesson__subject")?.textContent?.trim() ||
            "";
        const teacher = [
            ...one.querySelectorAll(
                ".position__lesson__info:not(.position__lesson__subject)",
            ),
        ]
            .map((el) => el.textContent.trim())
            .filter(Boolean)
            .join(" \u00b7 ") ||
            one.querySelector(".position__lesson__info")?.textContent?.trim() ||
            "";
        const label =
            RESKIN_ATT_LABELS[status] ||
            sym?.getAttribute("aria-label") ||
            sym?.textContent?.trim() ||
            "";
        const mod = RESKIN_ATT_CHIP[status] ?? (status ? "info" : "");

        const card = reskinEl("div", "ifv-lesson ifv-lesson--att");
        const top = reskinEl("div", "ifv-lesson__top");
        if (time) top.appendChild(reskinEl("span", "ifv-lesson__time", time));
        if (label)
            top.appendChild(
                reskinEl(
                    "span",
                    `ifv-lesson__chip ifv-lesson__att-chip${
                        mod ? ` ifv-lesson__chip--${mod}` : ""
                    }`,
                    label,
                ),
            );
        if (top.children.length) card.appendChild(top);

        if (subject) {
            const body = reskinEl("div", "ifv-lesson__subject");
            body.appendChild(
                reskinEl("span", "ifv-lesson__subject-text", subject),
            );
            card.appendChild(body);
        }
        if (teacher)
            card.appendChild(reskinEl("div", "ifv-lesson__teacher", teacher));

        card.__ifvOrig = one;
        return card;
    };

    const buildReskinAttendanceList = (host) => {
        const grid = host.querySelector(".timetable__grid");
        if (!grid) return;
        const cells = [
            ...grid.querySelectorAll(
                ".cell .frequency-position__one-item",
            ),
        ]
            .map((one) => {
                const raw =
                    one.querySelector(
                        ".position__lesson__hours",
                    )?.textContent?.trim() || "";
                const m = /^(\d{1,2}):(\d{2})/.exec(raw);
                return {
                    one,
                    start: m ? m[1] * 60 + +m[2] : 0,
                };
            })
            .sort((a, b) => a.start - b.start)
            .map((x) => x.one);
        const sig = cells
            .map((one) => {
                const hr =
                    one.querySelector(
                        ".position__lesson__hours",
                    )?.textContent?.trim() || "";
                const sub =
                    one.querySelector(
                        ".position__lesson__subject",
                    )?.textContent?.trim() || "";
                const sym = one.querySelector(".frekwencja-symbol");
                const st =
                    sym?.getAttribute("aria-label") ||
                    sym?.textContent?.trim() ||
                    "";
                return [hr, sub, st].join("|");
            })
            .join(";");
        const existing = host.querySelector(":scope > .ifv-attendance");
        if (existing && host.dataset.ifvAttSig === sig) return;
        if (existing) existing.remove();
        host.dataset.ifvAttSig = sig;

        const list = reskinEl("div", "ifv-attendance");
        if (!cells.length) {
            list.appendChild(reskinEl("div", "ifv-empty", "Brak lekcji"));
        } else {
            cells.forEach((one) =>
                list.appendChild(buildReskinAttendanceCard(one)),
            );
        }
        host.insertBefore(list, host.firstChild);
    };

    const RESKIN_ATT_DAYS = {
        Poniedziałek: "Pon",
        Wtorek: "Wt",
        Środa: "Śr",
        Czwartek: "Czw",
        Piątek: "Pt",
        Sobota: "Sob",
        Niedziela: "Nd",
    };

const RESKIN_ATT_DAY_RE =
        /Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota|Niedziela/;

    let reskinAttNavObs = null;

    const reskinAttNavHeader = (accordion) =>
        (
            accordion.querySelector(".accordion__full-width__header h2")
                ?.textContent || ""
        )
            .replace(/\s+/g, " ")
            .trim();

    const reskinAttNavDays = () => [
        ...document.querySelectorAll(".MuiAccordion-root[data-ifv-att]"),
    ];

    const reskinAttNavActive = () => {
        const idx = reskinAttNavDays().findIndex((a) =>
            a.className.toString().includes("Mui-expanded"),
        );
        return idx < 0 ? 0 : idx;
    };

    const reskinAttNavState = () => {
        const days = reskinAttNavDays();
        const bar = days[0]?.parentElement?.querySelector(
            ":scope > .ifv-att-nav",
        );
        if (!bar || !days.length) return;
        const active = reskinAttNavActive();
        bar.querySelectorAll(".ifv-att-nav__day").forEach((b) =>
            b.classList.toggle("is-active", +b.dataset.i === active),
        );
    };

    const reskinAttNavGo = (target) => {
        const days = reskinAttNavDays();
        if (!days.length) return;
        const total = days.length;
        const idx = ((target % total) + total) % total;
        days.forEach((a, i) => {
            const expanded = a.className.toString().includes("Mui-expanded");
            if ((i === idx) === expanded) return;
            a.querySelector(".MuiAccordionSummary-root")?.click();
        });
        requestAnimationFrame(reskinAttNavState);
        setTimeout(reskinAttNavState, 160);
    };

    const reskinAttNavSig = () =>
        reskinAttNavDays()
            .map(reskinAttNavHeader)
            .join("|");

    const RESKIN_ATT_MONTHS = {
        stycznia: "01",
        lutego: "02",
        marca: "03",
        kwietnia: "04",
        maja: "05",
        czerwca: "06",
        lipca: "07",
        sierpnia: "08",
        września: "09",
        października: "10",
        listopada: "11",
        grudnia: "12",
    };

    const reskinAttNavDatePart = (header) => {
        const rest = header.split(",")[1] || "";
        const m = /^\s*(\d{1,2})\s+([^\s]+)\s+(\d{4})\s*$/.exec(rest);
        if (!m) return null;
        return {
            day: String(+m[1]),
            month: RESKIN_ATT_MONTHS[m[2].toLowerCase()] || "??",
            year: m[3],
        };
    };

    const reskinAttNavRange = (days) => {
        const parts = days.map((a) =>
            reskinAttNavDatePart(reskinAttNavHeader(a)),
        );
        if (!parts.length || parts.some((p) => !p)) return "";
        const first = parts[0];
        const last = parts[parts.length - 1];
        if (first.month === last.month && first.year === last.year)
            return `${first.day}-${last.day}.${first.month}.${first.year}`;
        return `${first.day}.${first.month}.${first.year} – ${last.day}.${last.month}.${last.year}`;
    };

    /* The day picker is the only in-week navigation. The side arrows switch
       whole weeks through the app's own week-selector: back lands on the
       previous week's last day (Friday), forward on the next week's first
       day (Monday). */
    const reskinAttNavWeek = (dir) => {
        const total = reskinAttNavDays().length;
        if (!total) return;
        const ws = document.querySelector(
            ".content-container__tab-subheader .week-selector",
        );
        const btn = ws?.querySelector(
            `[aria-label="${dir > 0 ? "Następny tydzień" : "Poprzedni tydzień"}"]`,
        );
        if (!btn) return;
        const oldSig = reskinAttNavSig();
        const target = dir > 0 ? 0 : total - 1;
        btn.click();
        let tries = 0;
        const poll = () => {
            if (tries++ >= 40) return;
            const nd = [
                ...document.querySelectorAll(".MuiAccordion-root"),
            ].filter(
                (a) =>
                    a.querySelector(".frekwencja") &&
                    RESKIN_ATT_DAY_RE.test(reskinAttNavHeader(a)),
            );
            if (
                nd.length !== total ||
                reskinAttNavDays().length !== total ||
                reskinAttNavSig() === oldSig
            ) {
                setTimeout(poll, 120);
                return;
            }
            reskinAttNavGo(target);
        };
        setTimeout(poll, 120);
    };

    const reskinAttNavObserve = (parent) => {
        if (reskinAttNavObs && reskinAttNavObs._ifvParent === parent) return;
        if (reskinAttNavObs) reskinAttNavObs.disconnect();
        reskinAttNavObs = new MutationObserver(reskinAttNavState);
        reskinAttNavObs._ifvParent = parent;
        reskinAttNavObs.observe(parent, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class"],
        });
    };

    const refreshReskinAttendanceNav = () => {
        if (!/(^|\/)frekwencja(\/|$|\?|#)/.test(W.location.pathname)) return;
        const days = [...document.querySelectorAll(".MuiAccordion-root")].filter(
            (a) =>
                a.querySelector(".frekwencja") &&
                RESKIN_ATT_DAY_RE.test(reskinAttNavHeader(a)),
        );
        if (days.length < 2) return;
        const parent = days[0].parentElement;
        if (!parent) return;
        const sig = days.map(reskinAttNavHeader).join("|");
        const existing = parent.querySelector(":scope > .ifv-att-nav");
        if (existing) {
            if (existing.dataset.ifvSig === sig) {
                reskinAttNavObserve(parent);
                reskinAttNavState();
                return;
            }
            existing.remove();
        }
        days.forEach((a, i) => a.setAttribute("data-ifv-att", String(i)));

        const bar = document.createElement("div");
        bar.className = "ifv-att-nav";
        bar.dataset.ifvSig = sig;

        const range = document.createElement("div");
        range.className = "ifv-att-nav__range";
        range.textContent = reskinAttNavRange(days);
        if (!range.textContent) range.style.display = "none";

        const row = document.createElement("div");
        row.className = "ifv-att-nav__row";
        row.innerHTML =
            `<button type="button" class="ifv-oceny-pager__arrow" data-ifv-dir="-1" aria-label="Poprzedni tydzień">` +
            `<svg viewBox="0 0 24 24"><path d="${RESKIN_CHEVRON.prev}"/></svg></button>` +
            `<div class="ifv-att-nav__days"></div>` +
            `<button type="button" class="ifv-oceny-pager__arrow" data-ifv-dir="1" aria-label="Następny tydzień">` +
            `<svg viewBox="0 0 24 24"><path d="${RESKIN_CHEVRON.next}"/></svg></button>`;
        const daysEl = row.querySelector(".ifv-att-nav__days");
        days.forEach((a, i) => {
            const header = reskinAttNavHeader(a);
            const [name, rest] = header.split(",");
            const dayNo = (rest || "").trim().match(/^\d+/)?.[0] || "";
            const short =
                RESKIN_ATT_DAYS[name.trim()] || name.trim().slice(0, 3);
            const b = document.createElement("button");
            b.type = "button";
            b.className = "ifv-att-nav__day";
            b.dataset.i = String(i);
            b.setAttribute("aria-label", header);
            const wr = document.createElement("span");
            wr.className = "ifv-att-nav__weekday";
            wr.textContent = short;
            const d = document.createElement("span");
            d.className = "ifv-att-nav__date";
            d.textContent = dayNo;
            b.appendChild(wr);
            b.appendChild(d);
            daysEl.appendChild(b);
        });
        bar.appendChild(range);
        bar.appendChild(row);
        bar.addEventListener("click", (event) => {
            const arrow = event.target.closest(".ifv-oceny-pager__arrow");
            const dayBtn = event.target.closest(".ifv-att-nav__day");
            if (!arrow && !dayBtn) return;
            event.preventDefault();
            if (dayBtn) reskinAttNavGo(+dayBtn.dataset.i);
            else reskinAttNavWeek(+arrow.getAttribute("data-ifv-dir"));
        });
        parent.insertBefore(bar, days[0]);
        reskinAttNavObserve(parent);
        reskinAttNavState();
    };

    const refreshReskinAttendance = () => {
        document
            .querySelectorAll(".frekwencja")
            .forEach(buildReskinAttendanceList);
        refreshReskinAttendanceNav();
    };

    const refreshReskinPlan = () => {
        document
            .querySelectorAll(".plan-position")
            .forEach(buildReskinNativeCard);
        document
            .querySelectorAll(".timetable .lesson")
            .forEach(buildReskinCustomCard);
        refreshReskinAttendance();
        refreshReskinDashboard();
    };

    const RESKIN_DASH_CHIP = {
        canceled: "Odwo\u0142ane",
        substitute: "Zast\u0119pstwo",
        conflicted: "Wi\u0119cej lekcji",
    };

    const reskinDashLesson = (pos) => {
        const hours =
            pos.querySelector(".position__lesson__hours")?.textContent?.trim() ||
            "";
        const [start, end] = hours.split("-").map((s) => s.trim());
        const subject =
            pos
                .querySelector(".position__lesson__subject")
                ?.textContent?.trim() || "";
        const teacher =
            pos.querySelector(".position__lesson__teacher")?.textContent?.trim() ||
            "";
        const classroom = (
            pos.querySelector(".position__lesson__subject + span")
                ?.textContent || ""
        )
            .replace(/[()]/g, "")
            .trim();
        const annotation = pos
            .querySelector(".plan-position__adnotation-title")
            ?.textContent?.trim();
        const type = pos.querySelector(".zastepstwo")
            ? "substitute"
            : pos.querySelector(".odwolane")
              ? "canceled"
              : pos.classList.contains("cell--multi--conflicted")
                ? "conflicted"
                : "normal";
        return { start, end, subject, teacher, classroom, annotation, type };
    };

    const reskinDashType = (tile) => {
        if (tile.querySelector(".plan-position, .lessons-container"))
            return "schedule";
        if (tile.querySelector(".frequency-position__bg")) return "freq";
        if (tile.querySelector(".tile__list__rectangle-boxes")) return "exams";
        if (tile.querySelector(".tile__list__borders")) return "list";
        if (tile.querySelector(".tile__empty__content, .tile__empty-bg"))
            return "empty";
        if (tile.querySelector(".tile__grades__item")) return "grades";
        return "";
    };

    const buildReskinDashHead = (tile) => {
        const head = tile.querySelector(".tile__header");
        if (!head || head.dataset.ifvDash) return;
        head.dataset.ifvDash = "1";
        head.classList.add("ifv-dash__head");
        const img = head.querySelector("img");
        if (img && !img.parentElement.classList.contains("ifv-dash__ico")) {
            const ico = reskinEl("span", "ifv-dash__ico");
            img.replaceWith(ico);
            ico.appendChild(img);
        }
    };

    const buildReskinDashSchedule = (tile) => {
        const content = tile.querySelector(".tile__content");
        if (!content) return;
        const data = [...tile.querySelectorAll(".plan-position")]
            .map(reskinDashLesson)
            .filter((d) => d.subject);
        const sig =
            "schedule:" +
            data
                .map((d) =>
                    [d.start, d.end, d.subject, d.teacher, d.classroom, d.type].join(
                        "|",
                    ),
                )
                .join(";");
        if (tile.dataset.ifvDashSig === sig) return;
        tile.dataset.ifvDashSig = sig;

        let list = content.querySelector(":scope > .ifv-dash__list");
        if (!list) {
            list = reskinEl("div", "ifv-dash__list");
            content.appendChild(list);
        }
        list.className = "ifv-dash__list ifv-dash__schedule";
        list.innerHTML = "";
        if (!data.length)
            list.appendChild(reskinEl("div", "ifv-empty", "Brak lekcji"));
        data.forEach((d) => {
            const row = reskinEl(
                "div",
                `ifv-dash__lesson ifv-dash__lesson--${d.type}`,
            );
            const time = reskinHours(d.start, d.end);
            if (time) row.appendChild(reskinEl("span", "ifv-dash__time", time));
            const body = reskinEl("div", "ifv-dash__lesson-body");
            body.appendChild(
                reskinEl("div", "ifv-dash__subject", d.subject),
            );
            const meta = [d.classroom, d.teacher]
                .filter(Boolean)
                .join(" \u00b7 ");
            if (meta) body.appendChild(reskinEl("div", "ifv-dash__meta", meta));
            row.appendChild(body);
            const chip = d.annotation || RESKIN_DASH_CHIP[d.type] || "";
            if (chip)
                row.appendChild(
                    reskinEl(
                        "span",
                        `ifv-dash__chip ifv-dash__chip--${d.type}`,
                        chip,
                    ),
                );
            list.appendChild(row);
        });
        tile.classList.add("ifv-dash__hide-native");
    };

    const buildReskinDashFreq = (tile) => {
        const content = tile.querySelector(".tile__content");
        if (!content) return;
        const groups = [...content.querySelectorAll(".tile__frequency__day")];
        const sig =
            "freq:" +
            groups
                .map(
                    (g) =>
                        (g.querySelector(".tile__important-text")?.textContent?.trim() ||
                            "") +
                        "#" +
                        g.querySelectorAll(".frequency-position__one-item").length,
                )
                .join(";");
        if (tile.dataset.ifvDashSig === sig) return;
        tile.dataset.ifvDashSig = sig;

        let list = content.querySelector(":scope > .ifv-dash__list");
        if (!list) {
            list = reskinEl("div", "ifv-dash__list");
            content.appendChild(list);
        }
        list.className = "ifv-dash__list ifv-dash__freq";
        list.innerHTML = "";
        groups.forEach((g) => {
            const grp = reskinEl("div", "ifv-dash__group");
            const day = g
                .querySelector(".tile__important-text")
                ?.textContent?.trim();
            if (day) grp.appendChild(reskinEl("div", "ifv-dash__day", day));
            g.querySelectorAll(".frequency-position__one-item").forEach((one) =>
                grp.appendChild(buildReskinAttendanceCard(one)),
            );
            list.appendChild(grp);
        });
        tile.classList.add("ifv-dash__hide-native");
    };

    const buildReskinDashExams = (tile) => {
        const content = tile.querySelector(".tile__content");
        if (!content) return;
        const days = [...content.querySelectorAll(".tile__exam__day")];
        const sig =
            "exams:" +
            days
                .map(
                    (d) =>
                        (d.querySelector(".tile__important-text")?.textContent?.trim() ||
                            "") +
                        "|" +
                        [...d.querySelectorAll("li")]
                            .map(
                                (li) =>
                                    (li.querySelector(
                                        ".tile__list__rectangle__bold",
                                    )?.textContent?.trim() || "") +
                                    (li.querySelector(
                                        ".tile__list__rectangle__ribbon",
                                    )?.textContent?.trim() || ""),
                            )
                            .join(","),
                )
                .join(";");
        if (tile.dataset.ifvDashSig === sig) return;
        tile.dataset.ifvDashSig = sig;

        let list = content.querySelector(":scope > .ifv-dash__list");
        if (!list) {
            list = reskinEl("div", "ifv-dash__list");
            content.appendChild(list);
        }
        list.className = "ifv-dash__list ifv-dash__exams";
        list.innerHTML = "";
        days.forEach((d) => {
            const grp = reskinEl("div", "ifv-dash__group");
            const day = d
                .querySelector(".tile__important-text")
                ?.textContent?.trim();
            if (day) grp.appendChild(reskinEl("div", "ifv-dash__day", day));
            d.querySelectorAll("li").forEach((li) => {
                const card = reskinEl("div", "ifv-dash__exam");
                const body = reskinEl("div", "ifv-dash__exam-body");
                body.appendChild(
                    reskinEl(
                        "div",
                        "ifv-dash__subject",
                        li.querySelector(".tile__list__rectangle__bold")
                            ?.textContent?.trim() || "",
                    ),
                );
                const ribbon = li
                    .querySelector(".tile__list__rectangle__ribbon")
                    ?.textContent?.trim();
                if (ribbon)
                    body.appendChild(
                        reskinEl(
                            "span",
                            "ifv-dash__chip ifv-dash__chip--info",
                            ribbon,
                        ),
                    );
                card.appendChild(body);
                const btn = li.querySelector("button.details-btn--appearance");
                if (btn) {
                    const clone = btn.cloneNode(true);
                    clone.classList.add("ifv-dash__exam-go");
                    clone.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        btn.click();
                    });
                    card.appendChild(clone);
                }
                grp.appendChild(card);
            });
            list.appendChild(grp);
        });
        tile.classList.add("ifv-dash__hide-native");
    };

    const buildReskinDashList = (tile) => {
        tile.querySelectorAll(".tile__list__borders").forEach((ul) => {
            ul.classList.add("ifv-dash__rows");
            ul.querySelectorAll(":scope > li").forEach((li) => {
                if (li.dataset.ifvDash) return;
                li.dataset.ifvDash = "1";
                li.classList.add("ifv-dash__row");
            });
        });
    };

    const refreshReskinDashboard = () => {
        const container = document.querySelector(".tile-container");
        if (!container) return;
        container.classList.add("ifv-dash");
        container.querySelectorAll(".tile").forEach((tile) => {
            const type = reskinDashType(tile);
            if (!type) return;
            tile.classList.add("ifv-dash__tile", `ifv-dash__tile--${type}`);
            buildReskinDashHead(tile);
            if (type === "schedule") buildReskinDashSchedule(tile);
            else if (type === "freq") buildReskinDashFreq(tile);
            else if (type === "exams") buildReskinDashExams(tile);
            else if (type === "list") buildReskinDashList(tile);
        });
    };

    let reskinPlanObserver = null;
    let reskinPlanFrame = 0;

    const mountReskinPlan = () => {
        refreshReskinPlan();
        if (reskinPlanObserver) return;

        reskinPlanObserver = new MutationObserver(() => {
            if (reskinPlanFrame) return;
            reskinPlanFrame = requestAnimationFrame(() => {
                reskinPlanFrame = 0;
                if (
                    document.querySelector(
                        ".plan-position, .timetable .lesson, .frekwencja .timetable__grid",
                    )
                )
                    refreshReskinPlan();
            });
        });
        reskinPlanObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });

        document.addEventListener("click", (event) => {
            const card = event.target.closest?.(".ifv-lesson");
            if (!card || event.target.closest("button")) return;
            const pos = card.closest(".plan-position");
            const details = pos?.querySelector(
                "button.details-btn--appearance",
            );
            if (details) {
                event.preventDefault();
                details.click();
                return;
            }
            const orig = card.__ifvOrig;
            if (
                orig &&
                (card.closest(".ifv-attendance") ||
                    card.closest(".ifv-dash__freq"))
            ) {
                event.preventDefault();
                orig.click();
            }
        });
    };

    const mountReskin = () => {
        applyReskinTheme();
        addReskinThemeToggle();
        syncReskinMetrics();
        mountOcenyPager();
        mountReskinPlan();
        waitForRender(() =>
            document.querySelector(".bottom-navigation-bar"),
        ).then(() => {
            decorateReskinNav();
            refreshReskinNavActive();
            syncReskinMetrics();
        });
    };

    const setupReskin = () => {
        applyReskinTheme();
        W.addEventListener("resize", syncReskinMetrics);
        if (!W.matchMedia) return;
        const mq = W.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            if ((getSetting(RESKIN_PATCH_NAME, "theme") || "auto") === "auto")
                applyReskinTheme();
        };
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else if (mq.addListener) mq.addListener(onChange);

        W.addEventListener("popstate", refreshReskinNavActive);
    };

    const PATCH_LIST = [
        {
            name: "Move title to header",
            description: "Moves title to header",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            css: ["moveTitleToHeader/style.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector(
                            ".header_logo_tools-container",
                        ) &&
                        document.querySelector(
                            ".app__content__header__h1_subtitle > h1",
                        ),
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen|wiadomosci).*/.test(
                            W.location.hostname,
                        ),
                    run: moveTitleToHeader,
                },
            ],
        },
        {
            name: "Change close button icon",
            description:
                "Replaces close buttons with back buttons to indicate more accurately what action it corresponds to.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["arrows.css"],
        },
        {
            name: "Move messages button",
            description: "Moves messages button to header.",
            devices: "mobileOnly",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector(".header__hamburger__icon"),
                    doesRunHere: () => /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: moveMessagesButton,
                },
            ],
        },
        {
            name: "Cleanup grades table",
            description:
                "Hides subjects without any grades and columns without content.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideSubjectsWithNoGrades/normalGrades.css"],
            modules: [
                {
                    onlyOnReloads: false,
                    doesRunHere: () => W.location.pathname.endsWith("oceny"),
                    run: prepGrades,
                },
            ],
        },
        {
            name: "Hide empty exam results",
            description: "Hides exam results instead of showing no data.",
            devices: "mobileOnly",
            css: ["hideEmptyExamResults.css"],
        },
        {
            name: "Hide footer",
            description: "Hides footer.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["hideFooter.css"],
        },
        {
            name: "Hide WCAG",
            description: "Hide WCAG buttons.",
            css: ["hideWCAG.css"],
        },
        {
            name: "Align Detailed Grades Button",
            description: "Aligns detailed grades button with other buttons.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["alignDetailedGradesButton.css"],
        },
        {
            name: "Hide Tutors From Board",
            description: "Hides tutors from board.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideTutorsFromBoard.css"],
        },
        {
            name: "Display Full Name",
            description: "Shows the user's name under the nickname.",
            devices: "desktopOnly",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        document.querySelector(
                            `.${isMessagesHost() ? "account__name span" : "side_student"}`,
                        ),
                    doesRunHere: () =>
                        /^(dziennik-)?(wiadomosci|uczen).*/.test(
                            W.location.hostname,
                        ),
                    run: displayFullName,
                },
            ],
        },
        {
            name: "Redirect To Board",
            description: "Redirects to board after login.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            css: ["redirectToBoard/styles.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: getLogoElement,
                    doesRunHere: () =>
                        /^(dziennik-)?(wiadomosci|uczen).*/.test(
                            W.location.hostname,
                        ),
                    run: setUpRedirectToBoard,
                },
            ],
        },
        {
            name: "Auto redirect to login page in eduVulcan",
            description: "Auto redirect to login page in eduVulcan.",
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        W.location.hostname === "eduvulcan.pl" &&
                        W.location.pathname === "/" &&
                        !isEduVulcanLoggedIn() &&
                        !!document.querySelector(
                            'a[href*="/logowanie"], a.vdpo-login-link',
                        ),
                    run: redirectToEVLogin,
                },
            ],
        },
        {
            name: "Auto redirect to dziennik",
            description:
                "W eduVULCAN automatycznie przechodzi do dziennika po zalogowaniu lub gdy już jesteś zalogowany.",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () => true,
                    doesRunHere: () => W.location.hostname === "eduvulcan.pl",
                    run: redirectToDziennik,
                },
            ],
        },
        {
            name: "Auto redirect to login page in Dziennik Vulcan",
            description: "Auto redirect to login page in Dziennik Vulcan.",
            setup: addDvAlternativeLoginLink,
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        W.location.hostname ===
                            "dziennik-uczen.vulcan.net.pl" &&
                        !W.location.pathname.split("/")[2],
                    run: redirectToDVLogin,
                },
            ],
        },
        {
            name: "Hide unneeded tiles in eduVulcan home",
            description:
                "Hides eduVulcan app download links tile, eduVulcan banner and ribbon.",
            allowedHostsCss: ["eduvulcan.pl"],
            css: ["cleanUpEduVulcanHome.css"],
        },
        {
            name: "Hide Help On Dashboard",
            description: 'Hides "Do you need help" tile.',
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideHelpOnDashboard.css"],
        },
        {
            name: "PWA Support",
            description: "Gives ability to install page as PWA.",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () => true,
                    doesRunHere: () =>
                        [
                            "eduvulcan.pl",
                            "uczen.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                        ].includes(W.location.hostname),
                    run: injectWebManifest,
                },
            ],
        },
        {
            name: "Reload on resize",
            description:
                "Reloads page while changing between desktop and mobile layouts.",
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () => true,
                    run: startResizeListening,
                },
            ],
        },
        {
            name: "Mobile Navigation",
            description:
                "Replaces aside with more readable bottom navigation bar designed.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["newMobileNavbar/styles.css"],
            setup: setupMobileNavbarState,
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector(".header__hamburger__icon"),
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: buildMobileNavbar,
                },
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(".bottom-navigation-bar")
                            ?.children?.length,
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: setHighlights,
                },
            ],
        },
        {
            name: "Hide weekends in monthly calendars",
            description:
                "Hides weekends in monthly calendars in timetable, exams and homework views.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["hideWeekends.css"],
        },
        {
            name: "Login and password together",
            description: "Show login and password inputs together on login page.",
            allowedHostsCss: [
                "eduvulcan.pl",
                "dziennik-logowanie.vulcan.net.pl",
            ],
            css: ["loginPasswordTogether/styles.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        !!document.querySelector("#Password, #Haslo"),
                    doesRunHere: () =>
                        ["eduvulcan.pl", "dziennik-logowanie.vulcan.net.pl"].includes(
                            W.location.hostname,
                        ),
                    run: fixLoginPage,
                },
            ],
        },
        {
            name: "Move user options to header",
            description:
                "Moves user avatar to header that opens dropdown with user options.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            devices: "mobileOnly",
            css: ["moveUserOptionsToHeader/styles.css"],
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () =>
                        document.querySelector(".header__logo-product")
                            ?.firstChild &&
                        document.querySelector(
                            ".header__hamburger__icon button",
                        ),
                    doesRunHere: () =>
                        /^(dziennik-)?(wiadomosci|uczen).*/.test(
                            W.location.hostname,
                        ),
                    run: moveUserOptionsToHeader,
                },
            ],
        },
        {
            name: "Resigned timetable",
            description: "Changes styles and navigation on timetable page.",
            devices: "mobileOnly",
            css: [
                "newTimetable/styles.css",
                "apis/bottomDateSelector/styles.css",
            ],
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(".app__content .MuiCollapse-root")
                            ?.style?.minHeight &&
                        document.querySelector(
                            "section.app__content .mobile__frame .plan-zajec",
                        ) &&
                        !document.querySelector(".spinner") &&
                        document.querySelector(
                            ".position__lesson__hours, .conflicted--details--hours",
                        ),
                    doesRunHere: () =>
                        W.location.pathname.endsWith("planZajec"),
                    run: runNewTimetable,
                },
            ],
        },
        {
            name: "Redisigned attendance",
            description:
                "Changes styles and navigation on attendance page.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["newAttendance/style.css"],
            setup: buildAttendanceTabs,
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(
                            ".app__content > .mobile__frame, .app__content > .desktop__frame",
                        ) &&
                        document.querySelector(
                            ".app__content__header > .toolbar > button",
                        ) &&
                        !document.querySelector(".spinner"),
                    doesRunHere: () =>
                        W.location.href.endsWith("frekwencja"),
                    run: createJustifyButton,
                },
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        !!document.querySelector(
                            ".content-container:has(.statistics)",
                        ) && !!document.querySelector(".tabsview"),
                    doesRunHere: () =>
                        W.location.pathname.endsWith("frekwencja"),
                    run: insertAttendanceTabs,
                },
            ],
        },
        {
            name: "Redesigned dashboard",
            description: "Changes styles of the home (dashboard) page.",
            devices: "mobileOnly",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["newDashboard/styles.css"],
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () =>
                        document.querySelector(".plan-zajec") &&
                        !document.querySelector(".spinner"),
                    doesRunHere: () => W.location.href.endsWith("tablica"),
                    run: runNewDashboard,
                },
            ],
        },
        {
            name: "Fix going back in history",
            description:
                "Allows to use the browser's back button to return to the expected location. (firefox only)",
            devices: "mobileOnly",
            modules: [
                {
                    onlyOnReloads: true,
                    isLoaded: () => true,
                    doesRunHere: () =>
                        [
                            "eduvulcan.pl",
                            "uczen.eduvulcan.pl",
                            "wiadomosci.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                            "dziennik-wiadomosci.vulcan.net.pl",
                        ].includes(W.location.hostname) &&
                        (typeof W.InstallTrigger !== "undefined" ||
                            /firefox/i.test(navigator.userAgent)),
                    run: fixGoingBack,
                },
            ],
        },
        {
            name: "Highlight today",
            description: "Highlights today's date in the calendar.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["highlightToday.css"],
        },
        {
            name: "Count averages",
            description:
                "Counts averages in grades table and gives access to „Uczeń na tle klasy”.",
            settings: [
                {
                    id: "plusValue",
                    name: "Plus value",
                    description:
                        "Value to add when the grade has a plus (e.g. 3+).",
                    type: "number",
                    default: 0.3,
                    step: 0.1,
                },
                {
                    id: "minusValue",
                    name: "Minus value",
                    description:
                        "Value to be deducted when the grade has a minus (e.g. 3-).",
                    type: "number",
                    default: 0.3,
                    step: 0.1,
                },
            ],
            modules: [
                {
                    onlyOnReloads: true,
                    run: modifyGradesRequests,
                },
            ],
        },
        {
            name: "Display settings on the website",
            description: "Makes patches settings accessible.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
                "wiadomosci.eduvulcan.pl",
                "dziennik-wiadomosci.vulcan.net.pl",
            ],
            modules: [
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        [
                            "uczen.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                            "wiadomosci.eduvulcan.pl",
                            "dziennik-wiadomosci.vulcan.net.pl",
                        ].includes(W.location.hostname) &&
                        window.innerWidth >= 1024,
                    run: addDesktopSettings,
                },
                {
                    onlyOnReloads: true,
                    doesRunHere: () =>
                        [
                            "uczen.eduvulcan.pl",
                            "dziennik-uczen.vulcan.net.pl",
                        ].includes(W.location.hostname) &&
                        window.innerWidth < 1024,
                    run: addMobileSettings,
                },
            ],
        },
        {
            name: RESKIN_PATCH_NAME,
            description:
                "Odświeżony, aplikacyjny wygląd (mobile-first): spójne karty, nowy pasek nawigacji, tryb ciemny i własny kolor akcentu.",
            allowedHostsCss: [
                "uczen.eduvulcan.pl",
                "dziennik-uczen.vulcan.net.pl",
            ],
            css: ["reskin/base.css"],
            settings: [
                {
                    id: "theme",
                    name: "Motyw",
                    description: "Jasny, ciemny lub automatyczny (wg systemu).",
                    type: "select",
                    default: "auto",
                    options: [
                        { value: "auto", name: "Automatyczny" },
                        { value: "light", name: "Jasny" },
                        { value: "dark", name: "Ciemny" },
                    ],
                },
                {
                    id: "accent",
                    name: "Kolor akcentu",
                    description: "Główny kolor aplikacji.",
                    type: "color",
                    default: "#6366f1",
                },
            ],
            setup: setupReskin,
            modules: [
                {
                    onlyOnReloads: false,
                    isLoaded: () => true,
                    doesRunHere: () =>
                        /^(dziennik-)?(uczen).*/.test(W.location.hostname),
                    run: mountReskin,
                },
            ],
        },
    ];

    GM_addStyle(CSS["patchesSettings/style.css"]);
    GM_addStyle(CSS_EXTRA);

    try {
        GM_registerMenuCommand("Ustawienia IFV", openStandaloneSettings);
    } catch (e) {
        console.error("[IFV]", e);
    }

    const init = () => {
        const options = loadOptions();
        let changed = false;
        for (const patch of PATCH_LIST) {
            if (options[patch.name] === undefined) {
                options[patch.name] = true;
                changed = true;
            }
        }
        if (changed) saveOptions(options);

        for (const patch of PATCH_LIST) {
            if (options[patch.name] === false) continue;
            if (!deviceOk(patch.devices)) continue;

            if (patch.css) {
                for (const file of patch.css) {
                    if (!CSS[file]) continue;
                    if (
                        patch.allowedHostsCss &&
                        !patch.allowedHostsCss.includes(currentHost())
                    )
                        continue;
                    GM_addStyle(CSS[file]);
                }
            }

            if (patch.setup) patch.setup();
            if (patch.modules)
                for (const module of patch.modules) appendModule(module);
        }

        execute();
    };

    init();
})();
