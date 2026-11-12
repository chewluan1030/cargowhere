# Prompts Log

This document records the user prompts provided during the development of **LotWatch SG / CargoWhere**.

---

### Prompt 1
> **User**:  
> build a singapore based carpark application that tracks real time carparks lots avaibility .build just the freontend for now, I will intergrate the backend later

---

### Prompt 2
> **User**:  
> git push https://[TOKEN_REDACTED]@github.com/chewluan1030/cargowhere.git

*(Note: Personal Access Token redacted for security)*

---

### Prompt 3
> **User**:  
> 1. add a serverless connection that pulls live data from LTA datamall using the following endpoint:  
> `# Live carpark lots (HDB, LTA and URA):`  
> `https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2`  
>  
> `# Every request needs the header:  AccountKey: <LTA_ACCOUNT_KEY>`  
>  
> 2. Store this in /api folder at project root level (not src file)  
>  
> 3. include /health.ts and /carparkavailability.ts within the same sub folder  
>  
> 4. do not hardcode any key, I will input them later  

---

### Prompt 4
> **User**:  
> collate all of the prompts & store them as a PROMPTS.md file
