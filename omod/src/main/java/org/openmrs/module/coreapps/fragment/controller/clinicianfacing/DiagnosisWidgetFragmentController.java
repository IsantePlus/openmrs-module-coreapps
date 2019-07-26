/**
 * The contents of this file are subject to the OpenMRS Public License
 * Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://license.openmrs.org
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
 * License for the specific language governing rights and limitations
 * under the License.
 *
 * Copyright (C) OpenMRS, LLC.  All Rights Reserved.
 */
package org.openmrs.module.coreapps.fragment.controller.clinicianfacing;

import org.openmrs.Concept;
import org.openmrs.Obs;
import org.openmrs.Patient;
import org.openmrs.api.ConceptService;
import org.openmrs.api.ObsService;
import org.openmrs.api.context.Context;
import org.openmrs.module.coreapps.CoreAppsProperties;
import org.openmrs.module.emrapi.patient.PatientDomainWrapper;
import org.openmrs.ui.framework.annotation.InjectBeans;
import org.openmrs.ui.framework.fragment.FragmentConfiguration;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;


public class DiagnosisWidgetFragmentController {

	public void controller(FragmentConfiguration config, @InjectBeans PatientDomainWrapper patientWrapper,
						   @InjectBeans CoreAppsProperties properties) {
		config.require("patient");
		Object patient = config.get("patient");
		
		ObsService obsService = Context.getObsService();
		ConceptService conceptService = Context.getConceptService();

		if (patient instanceof Patient) {
			patientWrapper.setPatient((Patient) patient);
			config.addAttribute("patient", patientWrapper);
		} else if (patient instanceof PatientDomainWrapper) {
			patientWrapper = (PatientDomainWrapper) patient;
		} else {
			throw new IllegalArgumentException("Patient must be of type Patient or PatientDomainWrapper");
		}

		int days = properties.getRecentDiagnosisPeriodInDays();
		Calendar recent = Calendar.getInstance();
		recent.set(Calendar.DATE, -days);
		
		Concept diagnosisConcept = conceptService.getConcept(new Integer(1284));
		List<Obs> diagnosisList = obsService.getObservationsByPersonAndConcept(patientWrapper.getPatient(), diagnosisConcept);
		
		Set<Concept> diagnosisSet = new HashSet<Concept>();
		Iterator<Obs> it = diagnosisList.iterator();
		
		while (it.hasNext()) {
			Obs obs = it.next();
			if (!diagnosisSet.add(obs.getValueCoded())) {
				it.remove();
			}
		}
		
		config.addAttribute("recentDiagnoses", diagnosisList);
	}
}
