function MpiPatientSearchWidget(configuration) {

    var defaults = {
        minSearchCharacters: 3,
        searchInputId: 'patient-search',
        searchResultsDivId: 'patient-search-results',
        clearButtonId: 'patient-search-clear-button',
        dateFormat: 'DD MMM YYYY',
        locale: 'en',
        defaultLocale: 'en'
    };
    delete configuration.handleRowSelection;

    var config = jq.extend({}, defaults, configuration);
    var attributeTypes = config.attributeTypes;
    var attributeHeaders = '';
    jq.each(attributeTypes, function (key, value) {
        attributeHeaders = attributeHeaders.concat('<th>' + value + '</th>');
    });
    var tableId = 'mpi-patient-search-results-table';
    var tableHtml = '<table id="' + tableId + '">' +
        '<thead>' +
        '<tr>' +
        '<th>' + config.messages.identifierColHeader + '</th>' +
        '<th>' + config.messages.nameColHeader + '</th>' +
        '<th>' + config.messages.genderColHeader + '</th>' +
        '<th>' + config.messages.ageColHeader + '</th>' +
        '<th>' + config.messages.birthdateColHeader + '</th>' +
        '<th>' + config.messages.actionColHeader + '</th>' +
        attributeHeaders +
        '</tr>' +
        '</thead>' +
        '<tbody></tbody>' +
        '</table>';

    var spinnerImage = '<span><img class="search-spinner" src="' + emr.resourceLink('uicommons', 'images/spinner.gif') + '" /></span>';

    jq('#' + config.searchResultsDivId).append('<div class="info-header"><h3>MPI Search Results</h3> <hr /></div>');
    jq('#' + config.searchResultsDivId).append(tableHtml);
    var input = jq('#' + config.searchInputId);
    var clearButton = jq('#' + config.clearButtonId);
    var searchResults = jq('#' + config.searchResultsDivId);
    var pageCount = 0;
    var searchResultsData = [];
    var highlightedKeyboardRowIndex;
    var highlightedMouseRowIndex;
    var searchDelayTimer;
    var requestCount = 0;
    var searchUrlMpi = '/' + OPENMRS_CONTEXT_PATH + '/registrationapp/matchingPatients/getSimilarPatients.action?appId=isanteplus.registration';
    var initialData = [];
    var initialPatientData = [];
    var initialPatientUuids = [];
    var tableObject = jq('#' + tableId);
    var performingSearch = false;  // flag to check if we are currently updating the search results
    var afterSearchResultsUpdated = [];  // stores a set of functions to execute after we update search results (currently we are only using this for the doEnter function)
    var lastQuery = null;

    // set the locale for Moment.js
    // Creole not currently supported by Moment and for some reason it defaults to Japaneses if we don't explicitly set fallback options in the locale() call
    moment.locale([configuration.locale, configuration.defaultLocale, 'en']);

    this.setHandleRowSelection = function (handleRowSelection) {
        config.handleRowSelection = handleRowSelection;
    }

    function formatAge(widgetBirthdate) {
        var bdate = moment(widgetBirthdate, 'YYYY-MM-DD');
        var age = moment().diff(bdate, 'months', false);
        var suffix = config.messages.ageInMonths;
        //If there is no translation, use english
        if (!suffix || suffix == "coreapps.age.months") {
            suffix = "{0} Month(s)";
        }
        if (age == 0) {
            age = moment().diff(bdate, 'days', false);
            suffix = config.messages.ageInDays;
            if (!suffix || suffix == "coreapps.age.days") {
                suffix = "{0} Day(s)";
            }
        }
        return suffix.replace("{0}", age);
    }


    //UP(38), DOWN(40), PAGE UP(33), PAGE DOWN(34)
    var keyboardNavigationKeys = [33, 34, 38, 40];
    /*
     *SHIFT(16), CTRL(17), ALT(18), CAPS LOCK(20), ESC(27), END(35), HOME(36), LEFT(37), RIGHT(39)
     *MAC COMMAND KEYs differ by browser
     *  Firefox: 224
     *  Opera: 17(CTRL equivalent)
     *  WebKit (Safari/Chrome): 91 (Left command key) or 93 (Right command key)
     */
    var keyboardControlKeys = [16, 17, 18, 20, 27, 35, 36, 37, 39, 91, 93, 224];
    var customRep = 'custom:(patientId,uuid,' +
        'patientIdentifier:(uuid,identifier),' +
        'person:(gender,age,birthdate,birthdateEstimated,personName),' +
        'attributes:(value,attributeType:(name)))';

    var doSearch = function (query, currRequestCount, autoSelectIfExactIdentifierMatch) {

        // set a flag to denote that we are starting a new search
        performingSearch = true;
        lastQuery = query;

        jq('#' + tableId).find('td.dataTables_empty').html(spinnerImage);
        if (!jq('#' + config.searchResultsDivId).is(':visible')) {
            jq('#' + config.searchResultsDivId).show();
        }

        query = jq.trim(query);
        if (query.indexOf(' ') >= 0) {
            searchOnIdentifierAndName(query, currRequestCount);
        } else {
            searchOnExactIdentifierMatchThenIdentifierAndName(query, currRequestCount, autoSelectIfExactIdentifierMatch);
        }
    }


    var searchOnExactIdentifierMatchThenIdentifierAndName = function (query, currRequestCount, autoSelectIfExactIdentifierMatch) {
        var names = query.split(' ');
        if (names.length > 1) {
            emr.getJSON(searchUrlMpi, {
                givenName: names[0],
                familyName: names[1]
            })
                .done(function (data) {
                    // update only if we've got results, and not late (late ajax responses should be ignored not to overwrite the latest)
                    if (data && (!currRequestCount || currRequestCount >= requestCount)) {
                        updateSearchResults(data);
                        if (autoSelectIfExactIdentifierMatch && data.length == 1) {
                            selectRow(0);
                        }
                    } else {
                        searchOnIdentifierAndName(query, currRequestCount);
                    }
                }).fail(function (jqXHR) {
                failSearch();
            });
        } else {
            emr.getJSON(searchUrlMpi, {givenName: query})
                .done(function (data) {
                    // update only if we've got results, and not late (late ajax responses should be ignored not to overwrite the latest)
                    if (data && (!currRequestCount || currRequestCount >= requestCount)) {
                        updateSearchResults(data);
                        if (autoSelectIfExactIdentifierMatch && data.length == 1) {
                            selectRow(0);
                        }
                    } else {
                        searchOnIdentifierAndName(query, currRequestCount);
                    }
                }).fail(function (jqXHR) {
                failSearch();
            });
        }

    }

    var searchOnIdentifierAndName = function (query, currRequestCount) {
        emr.getJSON(searchUrlMpi, {
            givenName: query
        })
            .done(function (data) {
                //late ajax responses should be ignored not to overwrite the latest
                if (data && (!currRequestCount || currRequestCount >= requestCount)) {
                    updateSearchResults(data);
                }
            })
            .fail(function (jqXHR) {
                failSearch();
            });
    }

    var failSearch = function () {
        performingSearch = false;
        if (!currRequestCount || currRequestCount >= requestCount) {
            jq('#' + tableId).find('td.dataTables_empty').html("<span class='patient-search-error'>" + config.messages.searchError + "</span>");
        }
    }

    var disableSearch = function () {
        clearSearch();
        jq('#patient-search').prop('disabled', true);
    }

    var enableSearch = function () {
        jq('#patient-search').prop('disabled', false);
    }

    var clearSearch = function () {
        // do a reset, but also clear the input and hide the search results
        reset();
        input.val('');
        input.focus();
        searchResults.hide();
    }

    var reset = function () {
        dTable.fnClearTable();
        searchResultsData = [];
        pageCount = 0;
        highlightedKeyboardRowIndex = undefined;
        highlightedMouseRowIndex = undefined;
        jq('#' + tableId).find('td.dataTables_empty').html(config.messages.noData);
    }
    this.reset = reset;

    var updateSearchResults = function (results) {
        var dataRows = [];
        if (results) {
            var results = removeMpiDuplicates(results);
            searchResultsData = searchResultsData.concat(results);
            _.each(results, function (patient) {
                var birthdate = '';
                var widgetBirthdate = patient.birthdate;
                if (patient.birthdate) {
                    birthdate = "&nbsp;&nbsp; " + moment(patient.birthdate).format(configuration.dateFormat);
                }
                var identifier = patient.identifiers[0].value;
                var age = 12;
                var patientName = patient.givenName + ' ' + patient.familyName;
                var dataRow = [identifier, patientName, patient.gender, age, birthdate,'<button class="'+ identifier + '"  style="float:right; margin:10px; padding: 2px 8px"><i class=""></i>Import and Open</button>'];
                dataRows.push(dataRow);
            });
        }
        dTable.fnAddData(dataRows);
        refreshTable();
        performingSearch = false;

        // perform any actions that may have been queued up during the action (currently limited to the doEnter action)
        if (!isTableEmpty()) {
            _.each(afterSearchResultsUpdated, function (fn) {
                fn();
            })
        }
        afterSearchResultsUpdated = [];
    }
    this.updateSearchResults = updateSearchResults;


    // remove any patients from a results list that are already in the search results
    var removeDuplicates = function (results) {
        return _.reject(results, function (result) {
            return _.some(searchResultsData, function (existing) {
                return existing.patientId == result.patientId;
            })
        });

    }
    // remove any patients from a results list that are already in the search results
    var removeMpiDuplicates = function (results) {
        return _.reject(results, function (result) {
            return _.some(searchResultsData, function (existing) {
                return existing.patientId == result.identifiers[0].value;
            })
        });

    }

    var refreshTable = function () {
        var rowCount = searchResultsData.length;
        if (rowCount % dTable.fnSettings()._iDisplayLength == 0) {
            pageCount = rowCount / dTable.fnSettings()._iDisplayLength;
        } else {
            pageCount = Math.floor(rowCount / dTable.fnSettings()._iDisplayLength) + 1;
        }
        if (rowCount == 0) {
            displayNoMatchesFound();
        }
        gotoFirstPage(); // always return back to the first page when refreshing the table
    }

    var displayNoMatchesFound = function () {

        if (!jq('#' + config.searchResultsDivId).is(':visible')) {
            jq('#' + config.searchResultsDivId).show();
        }

        jq('#' + tableId).find('td.dataTables_empty').html(config.messages.noMatchesFound);
    }

    var isTableEmpty = function () {
        if (searchResultsData.length > 0) {
            return false
        }
        return !dTable || dTable.fnGetNodes().length == 0;
    }

    var gotoPage = function (pageIndex) {
        dTable.fnPageChange(pageIndex);
    }

    var gotoFirstPage = function () {
        gotoPage(0);
    }

    var selectRow = function (selectedRowIndex) {
        // config.handleRowSelection.handle(searchResultsData[selectedRowIndex], widgetData);
        var id = searchResultsData[selectedRowIndex].identifiers[0].value;
        var importButton = jq('.'+id + '');
        toggleImportButtonDisplay(importButton);
        $.getJSON(emr.fragmentActionLink("registrationapp", "registerPatient", "importMpiPatient", {mpiPersonId: id}))
            .success(function (response) {
                var link = emr.pageLink("coreapps", "clinicianfacing/patient");
                link += (link.indexOf('?') == -1 ? '?' : '&') + 'patientId=' + response.message;
                location.href = link;
            })
            .error(function (xhr, status, err) {
                toggleImportButtonDisplay(importButton);
                alert('AJAX error ' + err);
            });

    }

    function toggleImportButtonDisplay(button) {
        if (!(button instanceof jQuery)) {
            button = jQuery(button);
        }
        if (button.is(':disabled')) {
            button.prop('disabled', false);
            button.find('i').attr('class', '');
        } else {
            button.prop('disabled', true);
            button.find('i').attr('class', 'fa fa-spinner fa-spin');
        }
    }

    var doKeyEnter = function () {
        // if no rows are currently highlighted
        if (highlightedKeyboardRowIndex == undefined) {
            if (dTable && dTable.fnGetNodes().length == 1) {
                // if there is only one row in the result set, automatically select that row
                // (so that you can scan a patient id and have it automatically  load that patient dashboard)
                selectRow(0);
            } else {
                // otherwise, perform a new search, triggering it to auto-select if an exact identifier match
                prepareForNewSearch();
                doSearch(input.val(), 0, true);
                return;
            }
        }

        // if there's a highlighted row, select it
        selectRow(highlightedKeyboardRowIndex);
    }

    var prepareForNewSearch = function () {
        //if there is any search delay in progress, cancel it
        if (searchDelayTimer != undefined) {
            window.clearTimeout(searchDelayTimer);
        }
        reset();
    }

    var doKeyDown = function () {
        //the user is using the mouse and they also want to use up/down keys?, dont support this
        if (highlightedMouseRowIndex != undefined)
            return;

        var prevRow = highlightedKeyboardRowIndex;
        //if we are on the last page, and the last row is highlighted, do nothing
        if (isLastPage() && prevRow >= (searchResultsData.length - 1))
            return;

        //only move the highlight to next row if it is currently on the visible page otherwise should be on first row
        if (isHighlightedRowOnVisiblePage()) {
            highlightedKeyboardRowIndex++;

            //If the selected row is the first one on the next page, flip over to its page
            if (highlightedKeyboardRowIndex != 0 && (highlightedKeyboardRowIndex % dTable.fnSettings()._iDisplayLength) == 0) {
                dTable.fnPageChange('next');
            }
        }

        if (prevRow != undefined) {
            unHighlightRow(dTable.fnGetNodes()[prevRow]);
        }

        highlightRow();
    }

    var doKeyUp = function () {
        if (highlightedMouseRowIndex)
            return;

        //we are on the first page and the first row is already highlighted, do nothing
        if (dTable.fnSettings()._iDisplayStart == 0 && highlightedKeyboardRowIndex == 0)
            return;

        var prevRow = highlightedKeyboardRowIndex;
        //only move the highlight to prev row if it is currently on the visible page otherwise shoule be last row
        if (isHighlightedRowOnVisiblePage()) {
            highlightedKeyboardRowIndex--;
            if (prevRow != undefined) {
                if (prevRow % dTable.fnSettings()._iDisplayLength == 0)
                    dTable.fnPageChange('previous');

                unHighlightRow(dTable.fnGetNodes()[prevRow]);
            }
        } else {
            //user just flipped pages, highlight the last row on the currently visible page
            if (!isLastPage()) {
                highlightedKeyboardRowIndex = dTable.fnSettings()._iDisplayStart + dTable.fnSettings()._iDisplayLength - 1;
            } else {
                //this is the last page, highlight the last item in the table
                highlightedKeyboardRowIndex = searchResultsData.length - 1;
            }
        }

        highlightRow();
    }

    var doPageDown = function () {
        dTable.fnPageChange('next');
        //if this is the last page and we already have a selected row, do nothing
        if (isLastPage() && isHighlightedRowOnVisiblePage())
            return;

        unHighlightKeyboardSelectedRowIfAny();
    }

    var doPageUp = function () {
        dTable.fnPageChange('previous');
        if (isHighlightedRowOnVisiblePage())
            return;

        unHighlightKeyboardSelectedRowIfAny();
    }

    /**
     * Highlights the row at the index that matches the value of 'highlightedKeyboardRowIndex' otherwise the
     * first on the current visible page
     */
    var highlightRow = function () {
        //always remove highlightfrom  the current keyboard row if any before proceeding
        if (highlightedKeyboardRowIndex != undefined) {
            var prevHighlightedRowNode = dTable.fnGetNodes()[highlightedKeyboardRowIndex];
            jq(prevHighlightedRowNode).removeClass('search_table_row_highlight');
        }
        //the row to highlight has to be on the visible page, this helps not to lose the highlight
        //when the user uses the pagination buttons(datatables provides no callback function)
        if (!isHighlightedRowOnVisiblePage()) {
            //highlight the first row on the currently visible page
            highlightedKeyboardRowIndex = dTable.fnSettings()._iDisplayStart;
        }
        var highlightedRowNode = dTable.fnGetNodes()[highlightedKeyboardRowIndex];
        jq(highlightedRowNode).addClass('search_table_row_highlight');
    }

    var unHighlightKeyboardSelectedRowIfAny = function () {
        if (highlightedKeyboardRowIndex != undefined) {
            unHighlightRow(dTable.fnGetNodes()[highlightedKeyboardRowIndex]);
            highlightedKeyboardRowIndex = undefined;
        }
    }

    /**
     * Removes the highlight from the specified row
     */
    var unHighlightRow = function (row) {
        jq(row).removeClass("search_table_row_highlight");
    }

    /**
     * Returns true if the row highlight is on the current visible page
     */
    var isHighlightedRowOnVisiblePage = function () {
        return highlightedKeyboardRowIndex != undefined && (highlightedKeyboardRowIndex >= dTable.fnSettings()._iDisplayStart)
            && (highlightedKeyboardRowIndex < (dTable.fnSettings()._iDisplayStart + dTable.fnSettings()._iDisplayLength));
    }

    /**
     * Gets the current page the user is viewing in the datatable
     */
    var getCurrVisiblePage = function () {
        return Math.ceil(dTable.fnSettings()._iDisplayStart / dTable.fnSettings()._iDisplayLength) + 1;
    }

    var isLastPage = function () {
        return getCurrVisiblePage() == pageCount;
    }

    /********************* INITIALIZATION DATATABLE *********************/

    var dTable = tableObject.dataTable({
        bFilter: false,
        bJQueryUI: true,
        bLengthChange: false,
        iDisplayLength: 15,
        sPaginationType: "full_numbers",
        bSort: false,
        aaData: initialData,
        sDom: 't<"fg-toolbar ui-toolbar ui-corner-bl ui-corner-br ui-helper-clearfix datatables-info-and-pg"ip>',
        oLanguage: {
            "sInfo": config.messages.info,
            "sInfoEmpty": " ",
            "sZeroRecords": config.messages.noMatchesFound,
            "oPaginate": {
                "sFirst": config.messages.first,
                "sPrevious": config.messages.previous,
                "sNext": config.messages.next,
                "sLast": config.messages.last
            }
        },

        fnDrawCallback: function (oSettings) {
            if (isTableEmpty()) {
                //this should ensure that nothing happens when the use clicks the
                //row that contain the text that says 'No data available in table'
                return;
            }

            if (highlightedKeyboardRowIndex != undefined && !isHighlightedRowOnVisiblePage()) {
                unHighlightRow(dTable.fnGetNodes(highlightedKeyboardRowIndex));
            }

            //fnDrawCallback is called on each page redraw so we need to remove any previous handlers
            //otherwise there will multiple hence the logic getting executed multiples times as the
            //user the goes back and forth between pages
            tableObject.find('tbody tr').unbind('click');
            tableObject.find('tbody tr').unbind('hover');

            tableObject.find('tbody tr').click(
                function () {
                    highlightedMouseRowIndex = dTable.fnGetPosition(this);
                    selectRow(highlightedMouseRowIndex);
                }
            );

            tableObject.find('tbody tr').hover(
                function () {
                    if (highlightedKeyboardRowIndex) {
                        var keyboardHighlightedNode = dTable.fnGetNodes()[highlightedKeyboardRowIndex];
                        unHighlightRow(keyboardHighlightedNode);
                        highlightedKeyboardRowIndex = undefined;
                    }
                    highlightedMouseRowIndex = dTable.fnGetPosition(this);
                }, function () {
                    highlightedMouseRowIndex = undefined;
                }
            );

            //ensure that the input never loses field whenever a user
            //e.g when user clicks the paging buttons
            input.focus();
        }
    });

    /***************** SETUP KEYBOARD AND MOUSE EVENT HANDLERS **************/

    // handle the clear button
    clearButton.click(function (event) {
        clearSearch();
    });

    input.keyup(function (event) {
        var kc = event.keyCode;
        //ignore enter(because it was handled already onkeydown), keyboard navigation and control keys
        if (kc == 13 || _.contains(keyboardNavigationKeys, kc) || _.contains(keyboardControlKeys, kc)) {
            return false;
        }

        prepareForNewSearch();

        var text = jq.trim(input.val());
        if (text.length >= config.minSearchCharacters) {
            // force a longer delay since we are going to search on a shorter string
            //or may be the user is still typing more characters
            var effectiveSearchDelay = config.searchDelayShort;
            if (config.minSearchCharacters < 3 && text.length < 3) {
                effectiveSearchDelay = config.searchDelayLong;
            }
            var currentCount = ++requestCount;
            //wait for a couple of milliseconds, if the user isn't typing anymore chars before triggering search
            //this minimizes the number of un-necessary calls made to the server for first typists
            searchDelayTimer = window.setTimeout(function () {
                doSearch(text, currentCount);
            }, effectiveSearchDelay);

        } else if (text.length == 0) {
            updateSearchResults();
        }

        return false;
    });

    //catch control keys to stop the cursor in the input box from moving.
    input.keydown(function (event) {
        var kc = event.keyCode;

        // special handling for the enter key--while for the arrow keys we disregard any keystrokes while performing a search.
        // we "cache" enter keystrokes so that they will be handled after the search is complete; this is to handle typing
        // or scanning exact-match patient identifiers without requiring an additional keystroke
        if (kc == 13) {
            if (!performingSearch) {
                doKeyEnter();
            } else {
                afterSearchResultsUpdated.push(doKeyEnter)
            }
            return false;
        }

        if ((_.contains(keyboardNavigationKeys, kc) && !isTableEmpty())) {

            switch (kc) {
                case 33:
                    doPageUp();
                    break;
                case 34:
                    doPageDown();
                    break;
                case 38:
                    doKeyUp();
                    break;
                case 40:
                    doKeyDown();
                    break;
            }
            ;

            return false;
        }

        return true;
    });


    /***************** Set up custom events that allow other elements to interact with the search **************/
    // see https://issues.openmrs.org/browse/RA-1404 for potential use cases
    jq('#patient-search-form').on('search:clear', function () {
        clearSearch();
    })

    jq('#patient-search-form').on('search:disable', function () {
        disableSearch();
    })

    jq('#patient-search-form').on('search:enable', function () {
        enableSearch();
    })

    jq('#patient-search-form').on('search:no-matches', function (event, identifier) {
        clearSearch();
        displayNoMatchesFound();
    })

    jq('#patient-search-form').on('search:placeholder', function (event, placeholder) {
        jq('#patient-search').attr('placeholder', placeholder);
    })

    /***************** Do initial search if one is specified **************/

    if (config.doInitialSearch) {
        doSearch(config.doInitialSearch);
        // For some reason without this the cursor is at position 0 of the input, i.e. before the initial value
        input[0].selectionStart = input.val().length;
    }
}