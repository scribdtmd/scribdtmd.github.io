$(document).ready(function () {
    // ==========================================
    // Constants and Global Variables
    // ==========================================
    const validDomains = {
        scribd: /^https:\/\/(?:[a-z]{2,3}\.)?scribd\.com\/document\/(\d+)\/([^\/]+)$/,
        slideshare: /^(?:https?:\/\/)?(?:www\.)?slideshare\.net\/([^\/]+)\/([^\/]+)/
    };

    let state = {
        downloadUrl: '',
        currentService: '',
        slideshareDocInfo: null
    };

    // ==========================================
    // UI Elements
    // ==========================================
    const elements = {
        errorMessage: $('.error-message'),
        downloadBtn: $('#downloadBtn'),
        switchContainer: $('.switch-container'),
        switchContainer2: $('.switch-container-2'),
        scribdLink: $('#scribdLink'),
        finalDownloadBtn: $('#finalDownloadBtn'),
        sliderToggle: $('#sliderToggle'),
        sliderToggleFormat: $('#sliderToggleFormat')
    };

    // Initialize UI
    elements.switchContainer.hide();
    elements.switchContainer2.hide();

    // ==========================================
    // Utility Functions
    // ==========================================
    function sanitizeFileName(fileName) {
        const decodedName = decodeURIComponent(fileName);
        return decodedName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '')
            .trim();
    }

    function parseSlideShareUrl(url) {
        const match = url.match(validDomains.slideshare);
        if (!match) return null;

        const [, username, docName] = match;
        const cleanDocName = docName.split('/')[0];

        return {
            username,
            documentName: cleanDocName,
            cleanName: cleanDocName
                .replace(/-/g, ' ')
                .replace(/[^a-zA-Z0-9 ]/g, '')
                .trim()
        };
    }

    // ==========================================
    // UI State Management
    // ==========================================
    function setLoadingState() {
        elements.downloadBtn
            .addClass('loading-state')
            .html('<i class="bi bi-arrow-repeat rotating-icon me-2"></i>Processing...');
    }

    function resetLoadingState() {
        elements.downloadBtn
            .removeClass('loading-state')
            .html('<i class="bi bi-download me-2"></i>Download');
    }

    function setFinalDownloadLoadingState(button) {
        button
            .prop('disabled', true)
            .html('<i class="bi bi-arrow-repeat rotating-icon me-2"></i>Downloading...');
    }

    function resetFinalDownloadLoadingState(button) {
        button
            .prop('disabled', false)
            .html('<i class="bi bi-download me-2"></i>Download');
    }

    function showError(message) {
        elements.errorMessage.show().html(`<i class="bi bi-exclamation-octagon me-2"></i>${message}`);
    }

    function hideError() {
        elements.errorMessage.hide();
    }

    function showConfirmationModal(fileName, fileType) {
        $('#fileName').text(fileName);
        $('#fileType').text(fileType);
        $('#downloadButtonText').text(`Download as ${fileType}`);
        $('#confirmationModal').modal('show');
    }

    // ==========================================
    // Core Download Logic
    // ==========================================
    async function downloadFile(url, fileName) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download file');
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    }

    async function processSlideShare(url) {
        const hdEnabled = elements.sliderToggle.prop('checked');
        const encodedUrl = encodeURIComponent(url);
        const getUrl = `${URLS.slideshareApi.getImages}?url=${encodedUrl}&hd=${hdEnabled}`;
        
        const getResponse = await $.get(getUrl);
        if (!getResponse?.images?.length) {
            throw new Error('No images found');
        }

        const postPayload = {
            hd: hdEnabled,
            images: getResponse.images,
            type: elements.sliderToggleFormat.prop('checked') ? "pptx" : "pdf"
        };

        const postResponse = await $.ajax({
            url: URLS.slideshareApi.getSlide,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(postPayload)
        });

        if (!postResponse?.url) {
            throw new Error('Invalid server response');
        }

        return `${URLS.slideshareApi.download}?${new URLSearchParams(postResponse).toString()}`;
    }

    async function handleScribdDownload() {
        const response = await fetch(state.downloadUrl);
        if (!response.ok) throw new Error('Failed to fetch document');

        const { data } = await response.json();
        const iframeMatch = data.match(/<iframe[^>]+src="([^"]+)"/i);
        if (!iframeMatch) throw new Error('Document not found');

        const urlParams = new URLSearchParams(iframeMatch[1].split('?')[1]);
        const fileUrl = decodeURIComponent(urlParams.get('file')).split('#')[0];
        
        const scribdUrl = elements.scribdLink.val().trim();
        const [, , docName] = scribdUrl.match(validDomains.scribd);
        
        const fileName = `${sanitizeFileName(docName)}.pdf`;
        await downloadFile(`${URLS.proxyEndpoint}${fileUrl}`, fileName);
    }

    async function handleSlideShareDownload() {
        if (!state.slideshareDocInfo) throw new Error('No SlideShare document info');
        
        const fileExt = elements.sliderToggleFormat.prop('checked') ? 'pptx' : 'pdf';
        const fileName = `${sanitizeFileName(state.slideshareDocInfo.documentName)}.${fileExt}`;
        await downloadFile(state.downloadUrl, fileName);
    }

    // ==========================================
    // Event Handlers
    // ==========================================
    elements.scribdLink.on('input', function () {
        const val = $(this).val().trim();
        hideError();
        const isSlideShare = parseSlideShareUrl(val) !== null;
        elements.switchContainer.toggle(isSlideShare);
        elements.switchContainer2.toggle(isSlideShare);
    });

    $('#downloadForm').on('submit', async function (e) {
        e.preventDefault();
        const input = elements.scribdLink.val().trim();

        if (!input) {
            this.reportValidity();
            hideError();
            return;
        }

        const isScribd = validDomains.scribd.test(input);
        state.slideshareDocInfo = parseSlideShareUrl(input);
        const isSlideshare = state.slideshareDocInfo !== null;

        if (!isScribd && !isSlideshare) {
            showError('Please insert a valid Scribd or SlideShare link!');
            return;
        }

        setLoadingState();
        hideError();
        state.currentService = isScribd ? 'scribd' : 'slideshare';

        try {
            if (isScribd) {
                const [, docId, docName] = input.match(validDomains.scribd);
                const safeName = docName.replace(/[^a-zA-Z0-9-]/g, '-');
                state.downloadUrl = `${URLS.corsProxy}${encodeURIComponent(`${URLS.scribdDownload}${docId}/${safeName}`)}`;
                showConfirmationModal(docName.replace(/-/g, ' '), 'PDF');
            } else {
                state.downloadUrl = await processSlideShare(input);
                showConfirmationModal(
                    state.slideshareDocInfo.documentName,
                    elements.sliderToggleFormat.prop('checked') ? 'PPTX' : 'PDF'
                );
            }
        } catch (error) {
            showError('Processing failed. Please try again!');
        } finally {
            resetLoadingState();
        }
    });

    elements.finalDownloadBtn.on('click', async function (e) {
        e.preventDefault();
        if (!state.downloadUrl) {
            $('#confirmationModal').modal('hide');
            return;
        }

        const button = $(this);
        setFinalDownloadLoadingState(button);

        try {
            if (state.currentService === 'scribd') {
                await handleScribdDownload();
            } else {
                await handleSlideShareDownload();
            }
        } catch (error) {
            console.error('Download error:', error);
            showError(error.message.includes('Failed to') ? error.message : 'Download failed. Please try again.');
        } finally {
            resetFinalDownloadLoadingState(button);
            $('#confirmationModal').modal('hide');
        }
    });
});