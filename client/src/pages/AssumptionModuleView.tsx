import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Plus, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STAT_DATA = [
  { age: 0, m1: "1.448", m2: "0", f1: "1.148", f2: "0" },
  { age: 1, m1: "0.635", m2: "0.338", f1: "0.517", f2: "0.332" },
  { age: 2, m1: "0.411", m2: "0.252", f1: "0.307", f2: "0.219" },
  { age: 3, m1: "0.344", m2: "0.202", f1: "0.235", f2: "0.158" },
  { age: 4, m1: "0.306", m2: "0.171", f1: "0.19", f2: "0.131" },
  { age: 5, m1: "0.281", m2: "0.167", f1: "0.156", f2: "0.121" },
  { age: 6, m1: "0.264", m2: "0.162", f1: "0.13", f2: "0.114" },
  { age: 7, m1: "0.275", m2: "0.151", f1: "0.118", f2: "0.103" },
  { age: 8, m1: "0.309", m2: "0.136", f1: "0.119", f2: "0.092" },
  { age: 9, m1: "0.337", m2: "0.121", f1: "0.123", f2: "0.087" },
  { age: 10, m1: "0.36", m2: "0.112", f1: "0.129", f2: "0.085" },
  { age: 11, m1: "0.379", m2: "0.121", f1: "0.137", f2: "0.09" },
  { age: 12, m1: "0.395", m2: "0.15", f1: "0.147", f2: "0.101" },
  { age: 13, m1: "0.408", m2: "0.191", f1: "0.158", f2: "0.119" },
  { age: 14, m1: "0.419", m2: "0.233", f1: "0.17", f2: "0.143" },
  { age: 15, m1: "0.431", m2: "0.273", f1: "0.183", f2: "0.167" },
  { age: 16, m1: "0.443", m2: "0.31", f1: "0.197", f2: "0.188" },
  { age: 17, m1: "0.456", m2: "0.343", f1: "0.211", f2: "0.204" },
  { age: 18, m1: "0.471", m2: "0.373", f1: "0.226", f2: "0.216" },
  { age: 19, m1: "0.489", m2: "0.4", f1: "0.242", f2: "0.224" },
  { age: 20, m1: "0.509", m2: "0.428", f1: "0.257", f2: "0.231" },
  { age: 21, m1: "0.53", m2: "0.458", f1: "0.273", f2: "0.237" },
  { age: 22, m1: "0.554", m2: "0.493", f1: "0.289", f2: "0.242" },
  { age: 23, m1: "0.579", m2: "0.533", f1: "0.306", f2: "0.246" },
  { age: 24, m1: "0.604", m2: "0.578", f1: "0.322", f2: "0.248" },
  { age: 25, m1: "0.627", m2: "0.628", f1: "0.339", f2: "0.253" },
  { age: 26, m1: "0.649", m2: "0.671", f1: "0.354", f2: "0.258" },
  { age: 27, m1: "0.667", m2: "0.699", f1: "0.369", f2: "0.265" },
  { age: 28, m1: "0.681", m2: "0.718", f1: "0.382", f2: "0.275" },
  { age: 29, m1: "0.69", m2: "0.734", f1: "0.395", f2: "0.29" },
  { age: 30, m1: "0.696", m2: "0.746", f1: "0.408", f2: "0.31" },
  { age: 31, m1: "0.699", m2: "0.752", f1: "0.419", f2: "0.329" },
  { age: 32, m1: "0.7", m2: "0.755", f1: "0.43", f2: "0.344" },
  { age: 33, m1: "0.701", m2: "0.756", f1: "0.442", f2: "0.358" },
  { age: 34, m1: "0.703", m2: "0.756", f1: "0.456", f2: "0.373" },
  { age: 35, m1: "0.711", m2: "0.756", f1: "0.472", f2: "0.391" },
  { age: 36, m1: "0.734", m2: "0.756", f1: "0.492", f2: "0.415" },
  { age: 37, m1: "0.772", m2: "0.756", f1: "0.518", f2: "0.446" },
  { age: 38, m1: "0.83", m2: "0.778", f1: "0.549", f2: "0.483" },
  { age: 39, m1: "0.908", m2: "0.829", f1: "0.588", f2: "0.528" },
  { age: 40, m1: "1.009", m2: "0.892", f1: "0.633", f2: "0.576" },
  { age: 41, m1: "1.133", m2: "0.962", f1: "0.686", f2: "0.625" },
  { age: 42, m1: "1.281", m2: "1.034", f1: "0.748", f2: "0.673" },
  { age: 43, m1: "1.454", m2: "1.105", f1: "0.818", f2: "0.718" },
  { age: 44, m1: "1.649", m2: "1.18", f1: "0.897", f2: "0.76" },
  { age: 45, m1: "1.863", m2: "1.268", f1: "0.987", f2: "0.802" },
  { age: 46, m1: "2.092", m2: "1.386", f1: "1.088", f2: "0.855" },
  { age: 47, m1: "2.335", m2: "1.54", f1: "1.201", f2: "0.924" },
  { age: 48, m1: "2.59", m2: "1.728", f1: "1.327", f2: "1.007" },
  { age: 49, m1: "2.857", m2: "1.943", f1: "1.465", f2: "1.106" },
  { age: 50, m1: "3.136", m2: "2.179", f1: "1.616", f2: "1.234" },
  { age: 51, m1: "3.427", m2: "2.423", f1: "1.779", f2: "1.384" },
  { age: 52, m1: "3.73", m2: "2.662", f1: "1.955", f2: "1.536" },
  { age: 53, m1: "4.043", m2: "2.895", f1: "2.145", f2: "1.693" },
  { age: 54, m1: "4.368", m2: "3.132", f1: "2.35", f2: "1.862" },
  { age: 55, m1: "4.705", m2: "3.391", f1: "2.573", f2: "2.052" },
  { age: 56, m1: "5.052", m2: "3.687", f1: "2.815", f2: "2.276" },
  { age: 57, m1: "5.41", m2: "4.029", f1: "3.08", f2: "2.549" },
  { age: 58, m1: "5.79", m2: "4.422", f1: "3.37", f2: "2.877" },
  { age: 59, m1: "6.207", m2: "4.863", f1: "3.693", f2: "3.257" },
  { age: 60, m1: "6.68", m2: "5.354", f1: "4.052", f2: "3.688" },
  { age: 61, m1: "7.225", m2: "5.891", f1: "4.455", f2: "4.162" },
  { age: 62, m1: "7.862", m2: "6.463", f1: "4.905", f2: "4.67" },
  { age: 63, m1: "8.606", m2: "7.077", f1: "5.407", f2: "5.219" },
  { age: 64, m1: "9.472", m2: "7.751", f1: "5.96", f2: "5.826" },
  { age: 65, m1: "10.475", m2: "8.326", f1: "6.563", f2: "6.348" },
  { age: 66, m1: "11.63", m2: "8.811", f1: "7.215", f2: "6.794" },
  { age: 67, m1: "12.95", m2: "9.391", f1: "7.92", f2: "7.332" },
  { age: 68, m1: "14.44", m2: "10.084", f1: "8.693", f2: "7.968" },
  { age: 69, m1: "16.099", m2: "10.908", f1: "9.566", f2: "8.691" },
  { age: 70, m1: "17.927", m2: "11.884", f1: "10.573", f2: "9.49" },
  { age: 71, m1: "19.919", m2: "13.043", f1: "11.748", f2: "10.366" },
  { age: 72, m1: "22.076", m2: "14.407", f1: "13.124", f2: "11.33" },
  { age: 73, m1: "24.412", m2: "15.998", f1: "14.725", f2: "12.403" },
  { age: 74, m1: "26.957", m2: "17.829", f1: "16.57", f2: "13.624" },
  { age: 75, m1: "29.741", m2: "19.912", f1: "18.675", f2: "15.035" },
  { age: 76, m1: "32.797", m2: "22.272", f1: "21.054", f2: "16.668" },
  { age: 77, m1: "36.156", m2: "24.941", f1: "23.727", f2: "18.557" },
  { age: 78, m1: "39.843", m2: "27.952", f1: "26.729", f2: "20.764" },
  { age: 79, m1: "43.879", m2: "31.376", f1: "30.111", f2: "23.38" },
  { age: 80, m1: "48.286", m2: "35.347", f1: "33.926", f2: "26.564" },
  { age: 81, m1: "53.082", m2: "39.852", f1: "38.227", f2: "30.4" },
  { age: 82, m1: "58.288", m2: "44.795", f1: "43.068", f2: "34.879" },
  { age: 83, m1: "63.922", m2: "50.267", f1: "48.506", f2: "40.027" },
  { age: 84, m1: "70.002", m2: "56.453", f1: "54.599", f2: "45.846" },
  { age: 85, m1: "76.546", m2: "63.566", f1: "61.409", f2: "52.3" },
  { age: 86, m1: "83.571", m2: "71.773", f1: "68.993", f2: "59.351" },
  { age: 87, m1: "91.091", m2: "81.165", f1: "77.395", f2: "66.974" },
  { age: 88, m1: "99.105", m2: "91.757", f1: "86.579", f2: "75.129" },
  { age: 89, m1: "107.593", m2: "103.496", f1: "96.423", f2: "83.756" },
  { age: 90, m1: "116.532", m2: "116.174", f1: "106.791", f2: "92.723" },
  { age: 91, m1: "125.899", m2: "129.683", f1: "117.546", f2: "102.129" },
  { age: 92, m1: "135.673", m2: "144.117", f1: "128.551", f2: "112.425" },
  { age: 93, m1: "145.832", m2: "159.523", f1: "139.684", f2: "124.184" },
  { age: 94, m1: "156.36", m2: "175.944", f1: "150.829", f2: "138.167" },
  { age: 95, m1: "167.239", m2: "190.675", f1: "161.876", f2: "154.489" },
  { age: 96, m1: "178.451", m2: "205.083", f1: "172.711", f2: "171.097" },
  { age: 97, m1: "190.203", m2: "222.561", f1: "183.542", f2: "187.111" },
  { age: 98, m1: "202.976", m2: "240.275", f1: "194.955", f2: "203.726" },
  { age: 99, m1: "217.244", m2: "258.199", f1: "207.531", f2: "220.888" },
  { age: 100, m1: "233.483", m2: "277.651", f1: "221.852", f2: "239.758" },
  { age: 101, m1: "252.162", m2: "299.081", f1: "238.497", f2: "260.71" },
  { age: 102, m1: "273.748", m2: "320.863", f1: "258.037", f2: "282.301" },
  { age: 103, m1: "298.7", m2: "342.855", f1: "281.038", f2: "304.391" },
  { age: 104, m1: "327.47", m2: "365.526", f1: "308.057", f2: "326.827" },
  { age: 105, m1: "360.499", m2: "387.654", f1: "339.639", f2: "349.11" },
  { age: 106, m1: "398.213", m2: "400", f1: "376.313", f2: "370.836" },
  { age: 107, m1: "441.023", m2: "400", f1: "418.587", f2: "390.168" },
  { age: 108, m1: "489.314", m2: "400", f1: "466.941", f2: "400" },
  { age: 109, m1: "543.434", m2: "400", f1: "521.812", f2: "400" },
  { age: 110, m1: "603.688", m2: "400", f1: "583.586", f2: "400" },
  { age: 111, m1: "670.31", m2: "400", f1: "652.56", f2: "400" },
  { age: 112, m1: "743.431", m2: "400", f1: "728.907", f2: "400" },
  { age: 113, m1: "823.02", m2: "400", f1: "812.6", f2: "400" },
  { age: 114, m1: "908.788", m2: "400", f1: "903.28", f2: "400" },
  { age: 115, m1: "1000", m2: "400", f1: "1000", f2: "400" },
  { age: 116, m1: "1000", m2: "400", f1: "1000", f2: "400" },
  { age: 117, m1: "1000", m2: "400", f1: "1000", f2: "400" },
  { age: 118, m1: "1000", m2: "400", f1: "1000", f2: "400" },
  { age: 119, m1: "1000", m2: "625", f1: "1000", f2: "625" },
  { age: 120, m1: "1000", m2: "1000", f1: "1000", f2: "1000" },
];

const FAS_DATA = [
  { age: 0, gmwbM: "1.013", noneM: "1.013", gmwbF: "1.023", noneF: "1.023", u: "1.018465", i4lM: "1.013", i4lF: "1.023" },
  { age: 1, gmwbM: "0.342", noneM: "0.342", gmwbF: "0.335", noneF: "0.335", u: "0.3385795", i4lM: "0.342", i4lF: "0.335" },
  { age: 2, gmwbM: "0.255", noneM: "0.255", gmwbF: "0.221", noneF: "0.221", u: "0.2376873", i4lM: "0.255", i4lF: "0.221" },
  { age: 3, gmwbM: "0.204", noneM: "0.204", gmwbF: "0.16", noneF: "0.16", u: "0.1817876", i4lM: "0.204", i4lF: "0.16" },
  { age: 4, gmwbM: "0.173", noneM: "0.173", gmwbF: "0.133", noneF: "0.133", u: "0.1527016", i4lM: "0.173", i4lF: "0.133" },
  { age: 5, gmwbM: "0.168", noneM: "0.168", gmwbF: "0.123", noneF: "0.123", u: "0.1454301", i4lM: "0.168", i4lF: "0.123" },
  { age: 6, gmwbM: "0.165", noneM: "0.165", gmwbF: "0.115", noneF: "0.115", u: "0.139522", i4lM: "0.165", i4lF: "0.115" },
  { age: 7, gmwbM: "0.153", noneM: "0.153", gmwbF: "0.104", noneF: "0.104", u: "0.1281603", i4lM: "0.153", i4lF: "0.104" },
  { age: 8, gmwbM: "0.137", noneM: "0.137", gmwbF: "0.093", noneF: "0.093", u: "0.1149807", i4lM: "0.137", i4lF: "0.093" },
  { age: 9, gmwbM: "0.123", noneM: "0.123", gmwbF: "0.087", noneF: "0.087", u: "0.1049824", i4lM: "0.123", i4lF: "0.087" },
  { age: 10, gmwbM: "0.114", noneM: "0.114", gmwbF: "0.086", noneF: "0.086", u: "0.0999832", i4lM: "0.114", i4lF: "0.086" },
  { age: 11, gmwbM: "0.123", noneM: "0.123", gmwbF: "0.091", noneF: "0.091", u: "0.1068002", i4lM: "0.123", i4lF: "0.091" },
  { age: 12, gmwbM: "0.152", noneM: "0.152", gmwbF: "0.102", noneF: "0.102", u: "0.1267969", i4lM: "0.152", i4lF: "0.102" },
  { age: 13, gmwbM: "0.193", noneM: "0.193", gmwbF: "0.121", noneF: "0.121", u: "0.1567918", i4lM: "0.193", i4lF: "0.121" },
  { age: 14, gmwbM: "0.235", noneM: "0.235", gmwbF: "0.145", noneF: "0.145", u: "0.1904225", i4lM: "0.235", i4lF: "0.145" },
  { age: 15, gmwbM: "0.275", noneM: "0.275", gmwbF: "0.169", noneF: "0.169", u: "0.2222354", i4lM: "0.275", i4lF: "0.169" },
  { age: 16, gmwbM: "0.313", noneM: "0.313", gmwbF: "0.19", noneF: "0.19", u: "0.2513214", i4lM: "0.313", i4lF: "0.19" },
  { age: 17, gmwbM: "0.346", noneM: "0.346", gmwbF: "0.206", noneF: "0.206", u: "0.2763172", i4lM: "0.346", i4lF: "0.206" },
  { age: 18, gmwbM: "0.376", noneM: "0.376", gmwbF: "0.217", noneF: "0.217", u: "0.2967683", i4lM: "0.376", i4lF: "0.217" },
  { age: 19, gmwbM: "0.404", noneM: "0.404", gmwbF: "0.226", noneF: "0.226", u: "0.3149471", i4lM: "0.404", i4lF: "0.226" },
  { age: 20, gmwbM: "0.432", noneM: "0.432", gmwbF: "0.233", noneF: "0.233", u: "0.3322169", i4lM: "0.432", i4lF: "0.233" },
  { age: 21, gmwbM: "0.463", noneM: "0.463", gmwbF: "0.239", noneF: "0.239", u: "0.3508501", i4lM: "0.463", i4lF: "0.239" },
  { age: 22, gmwbM: "0.497", noneM: "0.497", gmwbF: "0.245", noneF: "0.245", u: "0.3708468", i4lM: "0.497", i4lF: "0.245" },
  { age: 23, gmwbM: "0.538", noneM: "0.538", gmwbF: "0.248", noneF: "0.248", u: "0.3931158", i4lM: "0.538", i4lF: "0.248" },
  { age: 24, gmwbM: "0.5840001", noneM: "0.5840001", gmwbF: "0.251", noneF: "0.251", u: "0.4172026", i4lM: "0.5840001", i4lF: "0.251" },
  { age: 25, gmwbM: "0.634", noneM: "0.634", gmwbF: "0.255", noneF: "0.255", u: "0.4444708", i4lM: "0.634", i4lF: "0.255" },
  { age: 26, gmwbM: "0.678", noneM: "0.678", gmwbF: "0.261", noneF: "0.261", u: "0.4694666", i4lM: "0.678", i4lF: "0.261" },
  { age: 27, gmwbM: "0.705", noneM: "0.705", gmwbF: "0.268", noneF: "0.268", u: "0.4867364", i4lM: "0.705", i4lF: "0.268" },
  { age: 28, gmwbM: "0.725", noneM: "0.725", gmwbF: "0.278", noneF: "0.278", u: "0.5017339", i4lM: "0.725", i4lF: "0.278" },
  { age: 29, gmwbM: "0.742", noneM: "0.742", gmwbF: "0.294", noneF: "0.294", u: "0.5176403", i4lM: "0.742", i4lF: "0.294" },
  { age: 30, gmwbM: "0.754", noneM: "0.754", gmwbF: "0.314", noneF: "0.314", u: "0.5335467", i4lM: "0.754", i4lF: "0.314" },
  { age: 31, gmwbM: "0.7600001", noneM: "0.7600001", gmwbF: "0.333", noneF: "0.333", u: "0.5462719", i4lM: "0.7600001", i4lF: "0.333" },
  { age: 32, gmwbM: "0.757", noneM: "0.757", gmwbF: "0.347", noneF: "0.347", u: "0.5521799", i4lM: "0.757", i4lF: "0.347" },
  { age: 33, gmwbM: "0.744", noneM: "0.744", gmwbF: "0.361", noneF: "0.361", u: "0.5521799", i4lM: "0.744", i4lF: "0.361" },
  { age: 34, gmwbM: "0.726", noneM: "0.726", gmwbF: "0.376", noneF: "0.376", u: "0.551271", i4lM: "0.726", i4lF: "0.376" },
  { age: 35, gmwbM: "0.714", noneM: "0.714", gmwbF: "0.395", noneF: "0.395", u: "0.5549068", i4lM: "0.714", i4lF: "0.395" },
  { age: 36, gmwbM: "0.719", noneM: "0.719", gmwbF: "0.419", noneF: "0.419", u: "0.5689953", i4lM: "0.719", i4lF: "0.419" },
  { age: 37, gmwbM: "0.744", noneM: "0.744", gmwbF: "0.45", noneF: "0.45", u: "0.5967179", i4lM: "0.744", i4lF: "0.45" },
  { age: 38, gmwbM: "0.784", noneM: "0.784", gmwbF: "0.488", noneF: "0.488", u: "0.6362568", i4lM: "0.784", i4lF: "0.488" },
  { age: 39, gmwbM: "0.838", noneM: "0.838", gmwbF: "0.533", noneF: "0.533", u: "0.6853394", i4lM: "0.838", i4lF: "0.533" },
  { age: 40, gmwbM: "0.902", noneM: "0.902", gmwbF: "0.582", noneF: "0.582", u: "0.7416936", i4lM: "0.902", i4lF: "0.582" },
  { age: 41, gmwbM: "0.972", noneM: "0.972", gmwbF: "0.632", noneF: "0.632", u: "0.8016835", i4lM: "0.972", i4lF: "0.632" },
  { age: 42, gmwbM: "1.044", noneM: "1.044", gmwbF: "0.68", noneF: "0.68", u: "0.8621278", i4lM: "1.044", i4lF: "0.68" },
  { age: 43, gmwbM: "1.116", noneM: "1.116", gmwbF: "0.725", noneF: "0.725", u: "0.9207544", i4lM: "1.116", i4lF: "0.725" },
  { age: 44, gmwbM: "1.192", noneM: "1.192", gmwbF: "0.767", noneF: "0.767", u: "0.9793809", i4lM: "1.192", i4lF: "0.767" },
  { age: 45, gmwbM: "1.281", noneM: "1.281", gmwbF: "0.81", noneF: "0.81", u: "1.045279", i4lM: "1.281", i4lF: "0.81" },
  { age: 46, gmwbM: "1.399", noneM: "1.399", gmwbF: "0.863", noneF: "0.863", u: "1.131174", i4lM: "1.399", i4lF: "0.863" },
  { age: 47, gmwbM: "1.555", noneM: "1.555", gmwbF: "0.933", noneF: "0.933", u: "1.244336", i4lM: "1.555", i4lF: "0.933" },
  { age: 48, gmwbM: "1.745", noneM: "1.745", gmwbF: "1.018", noneF: "1.018", u: "1.381586", i4lM: "1.745", i4lF: "1.018" },
  { age: 49, gmwbM: "1.961", noneM: "1.961", gmwbF: "1.117", noneF: "1.117", u: "1.539287", i4lM: "1.961", i4lF: "1.117" },
  { age: 50, gmwbM: "2.201", noneM: "2.201", gmwbF: "1.246", noneF: "1.246", u: "1.723347", i4lM: "2.201", i4lF: "1.246" },
  { age: 51, gmwbM: "2.416", noneM: "2.39", gmwbF: "1.362", noneF: "1.355", u: "1.872646", i4lM: "2.416", i4lF: "1.362" },
  { age: 52, gmwbM: "2.647", noneM: "2.59", gmwbF: "1.459", noneF: "1.444", u: "2.01714", i4lM: "2.647", i4lF: "1.459" },
  { age: 53, gmwbM: "2.841", noneM: "2.75", gmwbF: "1.565", noneF: "1.541", u: "2.145547", i4lM: "2.841", i4lF: "1.565" },
  { age: 54, gmwbM: "3.065", noneM: "2.934", gmwbF: "1.673", noneF: "1.638", u: "2.285744", i4lM: "3.065", i4lF: "1.673" },
  { age: 55, gmwbM: "3.277", noneM: "3.102", gmwbF: "1.774", noneF: "1.725", u: "2.413519", i4lM: "3.277", i4lF: "1.774" },
  { age: 56, gmwbM: "3.423", noneM: "3.372", gmwbF: "1.892", noneF: "1.915", u: "2.643179", i4lM: "3.562", i4lF: "1.969" },
  { age: 57, gmwbM: "3.56", noneM: "3.649", gmwbF: "2.036", noneF: "2.145", u: "2.896636", i4lM: "3.855", i4lF: "2.205" },
  { age: 58, gmwbM: "3.755", noneM: "4.005", gmwbF: "2.208", noneF: "2.42", u: "3.21226", i4lM: "4.231", i4lF: "2.488" },
  { age: 59, gmwbM: "3.93", noneM: "4.362", gmwbF: "2.379", noneF: "2.713", u: "3.537609", i4lM: "4.608", i4lF: "2.79" },
  { age: 60, gmwbM: "4.159", noneM: "4.803", gmwbF: "2.589", noneF: "3.073", u: "3.938166", i4lM: "5.074", i4lF: "3.16" },
  { age: 61, gmwbM: "4.576", noneM: "5.284", gmwbF: "2.922", noneF: "3.469", u: "4.376588", i4lM: "5.582", i4lF: "3.566" },
  { age: 62, gmwbM: "5.021", noneM: "5.798", gmwbF: "3.28", noneF: "3.893", u: "4.845472", i4lM: "6.125", i4lF: "4.002" },
  { age: 63, gmwbM: "5.5", noneM: "6.35", gmwbF: "3.665", noneF: "4.35", u: "5.349906", i4lM: "6.708", i4lF: "4.472" },
  { age: 64, gmwbM: "6.024", noneM: "6.954", gmwbF: "4.091", noneF: "4.855", u: "5.904684", i4lM: "7.346", i4lF: "4.992" },
  { age: 65, gmwbM: "6.471", noneM: "7.47", gmwbF: "4.459", noneF: "5.291", u: "6.380955", i4lM: "7.891", i4lF: "5.44" },
  { age: 66, gmwbM: "6.849", noneM: "8.049", gmwbF: "4.774", noneF: "5.767", u: "6.908129", i4lM: "8.351", i4lF: "5.823" },
  { age: 67, gmwbM: "7.3", noneM: "8.735001", gmwbF: "5.153", noneF: "6.337", u: "7.53592", i4lM: "8.9", i4lF: "6.285" },
  { age: 68, gmwbM: "7.84", noneM: "9.549001", gmwbF: "5.6", noneF: "7.012", u: "8.280604", i4lM: "9.557", i4lF: "6.83" },
  { age: 69, gmwbM: "8.481", noneM: "10.516", gmwbF: "6.11", noneF: "7.788", u: "9.152101", i4lM: "10.337", i4lF: "7.451" },
  { age: 70, gmwbM: "9.243", noneM: "11.666", gmwbF: "6.673", noneF: "8.658999", u: "10.16224", i4lM: "11.264", i4lF: "8.137" },
  { age: 71, gmwbM: "10.555", noneM: "13.033", gmwbF: "7.586", noneF: "9.63", u: "11.33149", i4lM: "12.362", i4lF: "8.889" },
  { age: 72, gmwbM: "12.132", noneM: "14.655", gmwbF: "8.627999", noneF: "10.716", u: "12.68567", i4lM: "13.655", i4lF: "9.716001" },
  { age: 73, gmwbM: "14.015", noneM: "16.564", gmwbF: "9.828", noneF: "11.942", u: "14.25316", i4lM: "15.163", i4lF: "10.637" },
  { age: 74, gmwbM: "16.248", noneM: "18.788", gmwbF: "11.234", noneF: "13.355", u: "16.07167", i4lM: "16.899", i4lF: "11.686" },
  { age: 75, gmwbM: "18.873", noneM: "21.354", gmwbF: "12.899", noneF: "15.004", u: "18.17913", i4lM: "18.873", i4lF: "12.899" },
  { age: 76, gmwbM: "21.273", noneM: "23.879", gmwbF: "14.413", noneF: "16.633", u: "20.25583", i4lM: "21.273", i4lF: "14.413" },
  { age: 77, gmwbM: "24.006", noneM: "26.732", gmwbF: "16.175", noneF: "18.518", u: "22.62475", i4lM: "24.006", i4lF: "16.175" },
  { age: 78, gmwbM: "27.11", noneM: "29.95", gmwbF: "18.243", noneF: "20.719", u: "25.33436", i4lM: "27.11", i4lF: "18.243" },
  { age: 79, gmwbM: "30.661", noneM: "33.604", gmwbF: "20.704", noneF: "23.328", u: "28.46609", i4lM: "30.661", i4lF: "20.704" },
  { age: 80, gmwbM: "34.801", noneM: "37.84", gmwbF: "23.712", noneF: "26.503", u: "32.17129", i4lM: "34.801", i4lF: "23.712" },
  { age: 81, gmwbM: "39.911", noneM: "43.051", gmwbF: "27.618", noneF: "30.621", u: "36.83617", i4lM: "39.911", i4lF: "27.618" },
  { age: 82, gmwbM: "45.628", noneM: "48.83", gmwbF: "31.94", noneF: "35.129", u: "41.9795", i4lM: "45.628", i4lF: "31.94" },
  { age: 83, gmwbM: "51.57", noneM: "54.759", gmwbF: "37.303", noneF: "40.698", u: "47.72834", i4lM: "51.57", i4lF: "37.303" },
  { age: 84, gmwbM: "58.889", noneM: "62.043", gmwbF: "43.48", noneF: "47.058", u: "54.5504", i4lM: "58.889", i4lF: "43.48" },
  { age: 85, gmwbM: "67.41", noneM: "70.471", gmwbF: "49.993", noneF: "53.677", u: "62.07351", i4lM: "67.41", i4lF: "49.993" },
  { age: 86, gmwbM: "76.247", noneM: "79.394", gmwbF: "56.882", noneF: "60.821", u: "70.10781", i4lM: "76.247", i4lF: "56.882" },
  { age: 87, gmwbM: "86.382", noneM: "89.594", gmwbF: "64.365", noneF: "68.54", u: "79.06725", i4lM: "86.382", i4lF: "64.365" },
  { age: 88, gmwbM: "96.913", noneM: "100.128", gmwbF: "72.415", noneF: "76.798", u: "88.46313", i4lM: "96.913", i4lF: "72.415" },
  { age: 89, gmwbM: "109.536", noneM: "112.734", gmwbF: "80.206", noneF: "84.72", u: "98.72701", i4lM: "109.536", i4lF: "80.206" },
  { age: 90, gmwbM: "123.228", noneM: "126.346", gmwbF: "89.08701", noneF: "93.724", u: "110.0347", i4lM: "123.228", i4lF: "89.08701" },
  { age: 91, gmwbM: "136.58", noneM: "139.521", gmwbF: "97.52", noneF: "102.195", u: "120.8579", i4lM: "136.58", i4lF: "97.52" },
  { age: 92, gmwbM: "152.181", noneM: "154.896", gmwbF: "107.752", noneF: "112.473", u: "133.6846", i4lM: "152.181", i4lF: "107.752" },
  { age: 93, gmwbM: "168.931", noneM: "171.341", gmwbF: "118.355", noneF: "123.063", u: "147.2019", i4lM: "168.931", i4lF: "118.355" },
  { age: 94, gmwbM: "185.128", noneM: "187.133", gmwbF: "132.281", noneF: "137.003", u: "162.0679", i4lM: "185.128", i4lF: "132.281" },
  { age: 95, gmwbM: "201.347", noneM: "202.865", gmwbF: "147.227", noneF: "151.896", u: "177.3801", i4lM: "201.347", i4lF: "147.227" },
  { age: 96, gmwbM: "216.573", noneM: "220.169", gmwbF: "163.438", noneF: "170.159", u: "195.164", i4lM: "216.573", i4lF: "163.438" },
  { age: 97, gmwbM: "237.353", noneM: "243.329", gmwbF: "180.89", noneF: "189.955", u: "216.6421", i4lM: "237.353", i4lF: "180.89" },
  { age: 98, gmwbM: "256.316", noneM: "264.87", gmwbF: "197.41", noneF: "209.015", u: "236.9422", i4lM: "256.316", i4lF: "197.41" },
  { age: 99, gmwbM: "278.16", noneM: "289.554", gmwbF: "216.67", noneF: "231.15", u: "260.3517", i4lM: "278.16", i4lF: "216.67" },
  { age: 100, gmwbM: "299.726", noneM: "314.129", gmwbF: "237.487", noneF: "255.119", u: "284.6239", i4lM: "299.726", i4lF: "237.487" },
  { age: 101, gmwbM: "322.933", noneM: "334.934", gmwbF: "265.556", noneF: "280.362", u: "307.6477", i4lM: "322.933", i4lF: "265.556" },
  { age: 102, gmwbM: "346.84", noneM: "356.168", gmwbF: "293.664", noneF: "305.193", u: "330.6808", i4lM: "346.84", i4lF: "293.664" },
  { age: 103, gmwbM: "367.495", noneM: "373.883", gmwbF: "319.691", noneF: "327.572", u: "350.7276", i4lM: "367.495", i4lF: "319.691" },
  { age: 104, gmwbM: "389.842", noneM: "393.116", gmwbF: "349.334", noneF: "353.366", u: "373.2411", i4lM: "389.842", i4lF: "349.334" },
  { age: 105, gmwbM: "400", noneM: "400", gmwbF: "375.531", noneF: "375.531", u: "387.7655", i4lM: "400", i4lF: "375.531" },
  { age: 106, gmwbM: "400", noneM: "400", gmwbF: "392.314", noneF: "392.314", u: "396.157", i4lM: "400", i4lF: "392.314" },
  { age: 107, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 108, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 109, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 110, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 111, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 112, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 113, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 114, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 115, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 116, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 117, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 118, gmwbM: "400", noneM: "400", gmwbF: "400", noneF: "400", u: "400", i4lM: "400", i4lF: "400" },
  { age: 119, gmwbM: "625", noneM: "625", gmwbF: "625", noneF: "625", u: "625", i4lM: "625", i4lF: "625" },
  { age: 120, gmwbM: "1000", noneM: "1000", gmwbF: "1000", noneF: "1000", u: "1000", i4lM: "1000", i4lF: "1000" },
];

const MortalityTable = ({ type }: { type: "STAT" | "FAS" }) => {
  const data = type === "STAT" ? STAT_DATA : FAS_DATA;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[10px] border-collapse bg-white shadow-sm border border-slate-200">
        <thead className="bg-slate-900 text-white">
          {type === "STAT" ? (
            <>
              <tr>
                <th rowSpan={2} className="border border-slate-700 p-1">Age</th>
                <th colSpan={2} className="border border-slate-700 p-1">Male</th>
                <th colSpan={2} className="border border-slate-700 p-1">Female</th>
              </tr>
              <tr>
                <th className="border border-slate-700 p-1">1983-2014</th>
                <th className="border border-slate-700 p-1">2015+</th>
                <th className="border border-slate-700 p-1">1983-2014</th>
                <th className="border border-slate-700 p-1">2015+</th>
              </tr>
            </>
          ) : (
            <>
              <tr>
                <th rowSpan={2} className="border border-slate-700 p-1">Age</th>
                <th colSpan={2} className="border border-slate-700 p-1">Male</th>
                <th colSpan={2} className="border border-slate-700 p-1">Female</th>
                <th rowSpan={2} className="border border-slate-700 p-1">U</th>
                <th colSpan={2} className="border border-slate-700 p-1">i4L</th>
              </tr>
              <tr>
                <th className="border border-slate-700 p-1">GMWB</th>
                <th className="border border-slate-700 p-1">Base</th>
                <th className="border border-slate-700 p-1">GMWB</th>
                <th className="border border-slate-700 p-1">Base</th>
                <th className="border border-slate-700 p-1">Male</th>
                <th className="border border-slate-700 p-1">Female</th>
              </tr>
            </>
          )}
        </thead>
        <tbody>
          {data.map((row: any, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="border border-slate-200 p-1 text-center font-bold bg-slate-50">{row.age}</td>
              {type === "STAT" ? (
                <>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.m1}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.m2}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.f1}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.f2}</td>
                </>
              ) : (
                <>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.gmwbM}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.noneM}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.gmwbF}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.noneF}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.u}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.i4lM}</td>
                  <td className="border border-slate-200 p-1 text-right font-mono">{row.i4lF}</td>
                </>
              )}
            </tr>
          ))}
          {data.length < 121 && (
             <tr><td colSpan={10} className="p-1 text-center text-[8px] text-slate-400 italic">... continues up to age 120</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const SectionCollapse = ({ label, children }: { label: string, children: React.ReactNode }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-4">
      <div 
        className={cn(
          "flex items-center gap-3 p-3 bg-slate-200 hover:bg-slate-300 cursor-pointer transition-all border border-slate-300 shadow-sm",
          expanded && "bg-slate-300 border-slate-400"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-5 h-5 flex items-center justify-center bg-white rounded-sm border border-slate-400 text-slate-800 shadow-sm">
          {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </div>
        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">{label}</span>
      </div>
      {expanded && <div className="p-6 bg-slate-50 border-x border-b border-slate-300 animate-in slide-in-from-top-2 duration-300">{children}</div>}
    </div>
  );
};

const AssumptionItem = ({ label, expanded: defaultExpanded = false }: { label: string, expanded?: boolean }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="mb-2">
      <div 
        className={cn(
          "flex items-center gap-3 p-2 bg-slate-200/80 hover:bg-slate-300/80 cursor-pointer transition-colors rounded-sm border border-slate-300 shadow-sm group",
          expanded && "bg-slate-300"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-5 h-5 flex items-center justify-center bg-white rounded-full border border-slate-400 text-slate-700 shadow-inner">
          {expanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </div>
        <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{label}</span>
      </div>
      {expanded && (label === "Intercept") && (
        <div className="mt-2 ml-8 p-4 bg-white border border-slate-200 rounded-md shadow-sm animate-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">MYGA Indicator</span>
                <span className="text-xs font-medium py-1">NonMYG</span>
                <span className="text-xs font-medium py-1">NonMYG</span>
                <span className="text-xs font-medium py-1">MYG</span>
                <span className="text-xs font-medium py-1">MYG</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Rider Type</span>
                <span className="text-xs font-medium py-1">Non-GMWB</span>
                <span className="text-xs font-medium py-1">GMWB</span>
                <span className="text-xs font-medium py-1">Non-GMWB</span>
                <span className="text-xs font-medium py-1">GMWB</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">SC Dur (99, 0, 1)</span>
                <span className="text-xs font-mono py-1">0.0094  0.6  0.02324</span>
                <span className="text-xs font-mono py-1">0.00419  0.2  0.00807</span>
                <span className="text-xs font-mono py-1">0.00407  0.5  0.038546</span>
                <span className="text-xs font-mono py-1">0.00181  0.1  0.013385</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function AssumptionModuleView() {
  return (
    <div className="min-h-screen bg-white p-8 space-y-12 animate-in fade-in duration-500">
      {/* Mortality Section */}
      <section className="space-y-6">
        <div className="bg-slate-900 text-white px-6 py-3 text-center rounded-sm shadow-lg border-b-4 border-blue-600">
          <h2 className="text-lg font-black uppercase tracking-[0.2em]">Mortality Module</h2>
          <p className="text-xs text-blue-400 font-bold italic mt-1 tracking-widest">Base Mortality * Mortality Improvement</p>
        </div>
        
        <div className="space-y-1">
          <SectionCollapse label="Base mortality">
            <div className="grid grid-cols-2 gap-12">
              <div className="space-y-3">
                <div className="bg-slate-800 text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest inline-block rounded-t-sm">STAT Basis</div>
                <MortalityTable type="STAT" />
              </div>
              <div className="space-y-3">
                <div className="bg-slate-800 text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest inline-block rounded-t-sm">FAS Basis</div>
                <MortalityTable type="FAS" />
              </div>
            </div>
          </SectionCollapse>

          <SectionCollapse label="Mortality Improvement">
            <div className="p-8 text-center bg-white border border-slate-200 rounded-sm shadow-inner text-slate-400 italic text-sm">
              Mortality Improvement factors view by STAT and FAS basis...
            </div>
          </SectionCollapse>
        </div>
      </section>

      {/* Lapse Section */}
      <section className="space-y-6">
        <div className="bg-slate-900 text-white px-6 py-3 text-center rounded-sm shadow-lg border-b-4 border-red-600">
          <h2 className="text-lg font-black uppercase tracking-[0.2em]">Lapse Module</h2>
          <div className="text-[10px] mt-2 space-y-1">
            <p className="text-red-400 font-bold italic">(Intercept * Dynamic Impact) / (1 + Intercept * Dynamic Impact)</p>
            <p className="text-blue-300 font-medium italic opacity-80">Dynamic Impact = Calendar Yr Impact * AttAgeFact * CredRateFac * CMTFac * NegCFTFac * PstCMTFac * GMIRFac * EffSCFac...</p>
          </div>
        </div>

        <div className="space-y-1.5 px-2">
          <AssumptionItem label="Intercept" expanded={true} />
          <AssumptionItem label="Attained Age Factor" />
          <AssumptionItem label="Int Cred" />
          <AssumptionItem label="Credited Rate Factor" />
          <AssumptionItem label="Size Factor" />
          <AssumptionItem label="CMT Pos Factor" />
          <AssumptionItem label="Duration after SC factor (FAS133)" />
          <AssumptionItem label="Non-PM Lapse" />
          <AssumptionItem label="Size / CR Factor" />
          <AssumptionItem label="ITM Factor" />
          <AssumptionItem label="CMT Factor" />
          <AssumptionItem label="GMIR Factor" />
          <AssumptionItem label="Calendar Year" />
          <AssumptionItem label="Effective Surrender Charge Factor" />
          <AssumptionItem label="Distribution Channel" />
        </div>
      </section>
    </div>
  );
}
