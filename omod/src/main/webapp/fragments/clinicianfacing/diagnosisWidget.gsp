<div id="coreapps-diagnosesList" class="info-section">
    <div class="info-header">
        <i class="icon-diagnosis"></i>
        <h3>${ ui.message("coreapps.clinicianfacing.diagnoses").toUpperCase() }</h3>
    </div>
    <div class="info-body">
		<% if (!config.recentDiagnoses) { %>
		${ ui.message("coreapps.none") }
		<% } else { %>
        <ul>
            <% config.recentDiagnoses.each { %>
            <li>
            <% if(it.valueText) { %>
                "${ui.escapeHtml(it.valueText)}"
            <% } else { %>
                ${ui.format(it.valueCoded)}
            <% } %>
            </li>
            <% } %>
        </ul>
		<% } %>
        <!-- <a class="view-more">${ ui.message("coreapps.clinicianfacing.showMoreInfo") } ></a> //-->
    </div>
</div>
